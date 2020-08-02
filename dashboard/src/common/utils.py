import asyncio
import json
import logging
import os
import re
import sys
from collections import defaultdict, deque
from datetime import datetime
from typing import Any, Dict, List, Optional

import aiohttp
import dateutil.parser
import google.auth
import yaml
from aiohttp.client import ClientSession
from fastapi import WebSocket
from google.auth.transport.requests import AuthorizedSession

from .constants import (
    CLOUD_BUILD_API,
    CLOUD_BUILD_TRIGGER_ID,
    CLOUDSDK_HOME,
    GITHUB_BRANCH,
    GITHUB_REPO,
)
from .models import App, AppConfig, BuildRef

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

loop = asyncio.get_event_loop()

credentials, project = google.auth.default(
    scopes=["https://www.googleapis.com/auth/cloud-platform"],
)


class Notifier:
    def __init__(self):
        self.connections: List[WebSocket] = list()
        self.generator = self.get_notification_generator()

    async def get_notification_generator(self):
        while True:
            message = yield
            await self._notify(message)

    async def _notify(self, message: str):
        # https://github.com/tiangolo/fastapi/issues/258
        living_connections = []
        while len(self.connections) > 0:
            # Looping like this is necessary in case a disconnection is handled
            # during await websocket.send_text(message)
            websocket = self.connections.pop()
            await websocket.send_text(message)
            living_connections.append(websocket)
        self.connections = living_connections

    async def send(self, type_: str, **body):
        message = json.dumps({"type": type_, "body": body})
        await self.generator.asend(message)

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.connections.remove(websocket)


class CloudBuildService:
    def __init__(self, notifier=None, app_service=None):
        self.notifier = notifier
        self.session = AuthorizedSession(credentials)

    def _googlesdk_cloudbuild_client(self):
        third_party_dir = os.path.join(CLOUDSDK_HOME, "lib", "third_party")
        if os.path.isdir(third_party_dir) and third_party_dir not in sys.path:
            sys.path.insert(0, third_party_dir)
        from googlecloudsdk.api_lib.cloudbuild import logs

        return logs.CloudBuildClient()

    def trigger_build(self, substitutions: Dict[str, str]) -> str:
        source = {
            "repoName": GITHUB_REPO,
            "branchName": GITHUB_BRANCH,
            "substitutions": substitutions,
        }
        resp = self.session.post(
            f"{CLOUD_BUILD_API}/{CLOUD_BUILD_TRIGGER_ID}:run", json=source,
        )
        resp.raise_for_status()

        operation = resp.json()
        return operation["metadata"]["build"]["id"]

    def get_build(self, id: str) -> Dict[str, Any]:
        resp = self.session.get(f"{CLOUD_BUILD_API}/projects/{project}/builds/{id}")
        resp.raise_for_status()
        return resp.json()

    def get_active_builds(self) -> List[Dict[str, Any]]:
        builds_query = {"filter": 'status="QUEUED" OR status="WORKING"'}
        project = "servian-labs-7apps"
        resp = self.session.get(
            f"{CLOUD_BUILD_API}/projects/{project}/builds", params=builds_query,
        )
        resp.raise_for_status()
        builds: List[Dict[str, str]] = resp.json().get("builds", [])
        return [
            {
                "id": b["id"],
                "start_time": dateutil.parser.parse(b["startTime"]),
                "finish_time": dateutil.parser.parse(b["finishTime"])
                if b.get("finishTime") is not None
                else None,
            }
            for b in builds
        ]

    async def get_logs(self, id: str):
        await self.notifier.send("build", status="starting")
        log_parser = self.parse_log_text
        notifier = self.notifier

        class _LogWriter:
            def Print(self, text):
                for t in text.split("\n"):
                    asyncio.run_coroutine_threadsafe(
                        notifier.send("log", **log_parser(t)), loop=loop
                    )

        build_ref = BuildRef(id=id, projectId=project)
        cb = self._googlesdk_cloudbuild_client()
        proxy_logger = _LogWriter()
        await loop.run_in_executor(None, cb.Stream, build_ref, proxy_logger)
        await self.notifier.send("build", status="finished")

    def parse_log_text(self, text):
        metadata = {"text": text}
        m = re.match(
            r"^(?P<status>Starting|Finished)? ?Step #(?P<step>\d{1,2}) - \"(?P<id>.*?)\"(?:\: (?P<message>.*))?$",
            text,
        )
        if m:
            metadata.update(m.groupdict())
        if text in ["FETCHSOURCE", "BUILD", "PUSH", "DONE"]:
            metadata["status"] = text
        return metadata


class AppService:
    def __init__(self, apps: List[App]):
        self.apps = apps
        self._history = defaultdict(lambda: deque(maxlen=2))

    @classmethod
    def load_from_config(cls, path):
        with open(path) as fp:
            a = yaml.safe_load(fp)
        apps = [App(**appinfo) for appinfo in a["apps"]]
        return cls(apps)

    def get_apps(self):
        return self.apps

    def get_app(self, name: str) -> Optional[App]:
        f_apps = list(filter(lambda app: app.name == name, self.apps))
        if not f_apps:
            return None
        app = f_apps[0]
        return app

    def patch_app(self, app: App) -> App:
        """ Patch app with the latest poll data """
        data_hist = self._history.get(app.name)
        if data_hist.count == 0:
            return app
        appdata = data_hist[0]  # latest
        app.version = appdata.get("version")
        app.config = AppConfig.parse_obj(appdata.get("config"))
        app.updated = datetime.utcnow()
        return app

    async def request_app(self, app: App, session: ClientSession):
        logger.debug("Getting data for app: %s", app.name)
        async with session.get(app.url) as response:
            data = await response.json()
            data["updated"] = datetime.utcnow()
            self._history[app.name].appendleft(data)
            return data

    async def create_request_poll(self, interval=5):
        headers = {"Accept": "application/json"}
        async with aiohttp.ClientSession(headers=headers) as session:
            while True:
                for app in self.apps:
                    try:
                        yield await self.request_app(app, session)
                    except aiohttp.ClientError:
                        logger.exception("Error polling app: %s", app.url)

                    await asyncio.sleep(interval)

    async def start_status_monitor(self, interval=5):
        async for appdata in self.create_request_poll():
            pass

    def stop_status_monitor(self):
        monitor_task = asyncio.ensure_future(self.start_status_monitor())
        monitor_task.cancel()

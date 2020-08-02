import asyncio
import json
import logging
import os
import re
import sys
from collections import defaultdict, deque
from datetime import datetime
from typing import Dict, List, Optional

import aiohttp
import google.auth
import yaml
from aiohttp.client import ClientSession
from fastapi import WebSocket
from google.auth.transport.requests import AuthorizedSession

from models.app import App, AppTheme
from models.cloud_build import BuildRef

from .constants import (
    CLOUD_BUILD_API,
    CLOUD_BUILD_TRIGGER_ID,
    CLOUDSDK_HOME,
    GITHUB_BRANCH,
    GITHUB_REPO,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

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
        self._logging = False

    def _googlesdk_cloudbuild_client(self):
        third_party_dir = os.path.join(CLOUDSDK_HOME, "lib", "third_party")
        if os.path.isdir(third_party_dir) and third_party_dir not in sys.path:
            sys.path.insert(0, third_party_dir)
        from googlecloudsdk.api_lib.cloudbuild import logs

        return logs.CloudBuildClient()

    def trigger_build(self, substitutions: Dict[str, str]) -> BuildRef:
        source = {
            "repoName": GITHUB_REPO,
            "branchName": GITHUB_BRANCH,
            "substitutions": substitutions,
        }
        resp = self.session.post(
            f"{CLOUD_BUILD_API}/{CLOUD_BUILD_TRIGGER_ID}:run", json=source,
        )
        resp.raise_for_status()
        data = resp.json()
        return BuildRef.parse_obj(data["metadata"]["build"])

    def get_build(self, id: str) -> BuildRef:
        resp = self.session.get(f"{CLOUD_BUILD_API}/projects/{project}/builds/{id}")
        resp.raise_for_status()
        data = resp.json()
        return BuildRef.parse_obj(data)

    def get_active_builds(self) -> List[BuildRef]:
        builds_query = {"filter": 'status="QUEUED" OR status="WORKING"'}
        project = "servian-labs-7apps"
        resp = self.session.get(
            f"{CLOUD_BUILD_API}/projects/{project}/builds", params=builds_query,
        )
        resp.raise_for_status()
        data = resp.json()
        return [BuildRef.parse_obj(b) for b in data.get("builds", [])]

    async def get_logs(self, build_ref: BuildRef):
        if self._logging:
            return
        self._logging = True
        await self.notifier.send("build", status="starting")
        log_parser = self.parse_log_text
        notifier = self.notifier

        class _LogWriter:
            def Print(self, text):
                for t in text.split("\n"):
                    asyncio.run_coroutine_threadsafe(
                        notifier.send("log", **log_parser(t)), loop=loop
                    )

        cb = self._googlesdk_cloudbuild_client()
        proxy_logger = _LogWriter()
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, cb.Stream, build_ref, proxy_logger)
        await self.notifier.send("build", status="finished")
        self._logging = False

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
    def __init__(self, **apps: App):
        self.apps = apps
        self._history = defaultdict(lambda: deque(maxlen=5))
        self._current_version = None
        self._monitor_future = None

    @classmethod
    def load_from_config(cls, path):
        with open(path) as fp:
            config = yaml.safe_load(fp)
        apps = {app["name"]: App.construct(**app) for app in config["apps"]}
        return cls(**apps)

    def get_apps(self) -> List[App]:
        return list(self.apps.values())

    def get_app(self, name: str) -> Optional[App]:
        return self.apps.get(name)

    def latest_version(self):
        return list(sorted(self.apps.values(), key=lambda app: app.updated))[0]

    async def request_app(self, app: App, session: ClientSession) -> App:
        logger.debug("Getting data for app: %s", app.name)
        async with session.get(app.url) as response:
            data = await response.json()
            return app.copy(update=data)

    async def get_latest_app_data(self) -> Dict[str, App]:
        headers = {"Accept": "application/json"}
        tasks = []
        async with aiohttp.ClientSession(headers=headers) as session:
            for app in self.apps.values():
                task = self.request_app(app, session)
                tasks.append(asyncio.ensure_future(task))
            latest = await asyncio.gather(*tasks)
        return dict(zip(self.apps.keys(), latest))

    async def refresh_app_data(self):
        self.apps = await self.get_latest_app_data()
        self._current_version = self.latest_version()

    async def poll_apps(self, interval=5):
        while True:
            latest = await self.get_latest_app_data()
            for name, app in self.apps.items():
                latest_app = latest[name]
                if (
                    app.version != latest_app.version
                    and latest_app.version != self._current_version
                ):
                    self.apps[name] = latest_app
                    self._history[name].appendleft(app)
                    # TODO: send notification to clients
            versions = list(set([app.version for app in latest.values()]))
            if len(versions) == 1 and versions[0] != self._current_version:
                logger.info("All apps updated to the same version")
                self._current_version = versions[0]
                self._monitor_future.cancel()
                break
            await asyncio.sleep(interval)

    async def start_status_monitor(self, interval=5):
        if self._monitor_future is None:
            self._monitor_future = asyncio.ensure_future(self.poll_apps())

    def stop_status_monitor(self):
        if self._monitor_future is not None:
            self._monitor_future.cancel()
        else:
            logging.debug("Monitoring not enabled, nothing to stop")

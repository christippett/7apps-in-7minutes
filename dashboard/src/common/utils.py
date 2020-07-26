import asyncio
import json
import logging
import os
import re
import sys
from collections import defaultdict, deque, namedtuple
from typing import Any, Dict, List

import aiofiles
import dateutil.parser
import google.auth
from fastapi import WebSocket
from google.auth.transport.requests import AuthorizedSession
from google.cloud import pubsub_v1

from .constants import (CLOUD_BUILD_API, CLOUD_BUILD_SUBSCRIPTION_ID,
                        CLOUD_BUILD_TRIGGER_ID, CLOUDSDK_HOME, GITHUB_BRANCH,
                        GITHUB_REPO)

logging.basicConfig(level=logging.INFO)
loop = asyncio.get_event_loop()
credentials, project = google.auth.default(
    scopes=["https://www.googleapis.com/auth/cloud-platform"],
)


def extract_app_name_from_url(url):
    m = re.search(r"^https?://(?P<name>.*?)[\.|:|/]", url, re.IGNORECASE)
    if m:
        return m.group("name").replace("_", "-").lower()
    raise ValueError("Invalid application URL")


class CloudBuildClient:
    def __init__(self):
        self.session = AuthorizedSession(credentials)

    def _googlesdk_cloudbuild(self):
        third_party_dir = os.path.join(CLOUDSDK_HOME, "lib", "third_party")
        if os.path.isdir(third_party_dir) and third_party_dir not in sys.path:
            sys.path.insert(0, third_party_dir)
        from googlecloudsdk.api_lib.cloudbuild import logs

        return logs

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

    def get_logs(self, id: str, messenger):
        log_parser = self.parse_log_text

        class _LogWriter:
            def Print(self, text):
                for t in text.split("\n"):
                    data = json.dumps(log_parser(t))
                    asyncio.run_coroutine_threadsafe(messenger(data), loop=loop)

        cb = self._googlesdk_cloudbuild()
        BuildRef = namedtuple("BuildRef", ["projectId", "id"])
        build_ref = BuildRef(id=id, projectId=project)
        out = _LogWriter()
        out.Print(
            r"""
   _______
  |____  /\
      / /  \   _ __  _ __  ___
     / / /\ \ | '_ \| '_ \/ __|
    / / ____ \| |_) | |_) \__ \
   /_/_/    \_\ .__/| .__/|___/
              | |   | |
              |_|   |_|

Starting Cloud Build job...
        """
        )
        cb.CloudBuildClient().Stream(build_ref, out=out)

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


class WebSocketManager:
    def __init__(self):
        self.connections: List[WebSocket] = list()
        self.pubsub = pubsub_v1.SubscriberClient()
        self.generator = self._get_stream_generator()
        # self.subscribe()

    async def _get_stream_generator(self):
        while True:
            data = yield
            await self.send(data)

    async def send(self, data: str):
        living_connections = []
        while len(self.connections) > 0:
            # Looping like this is necessary in case a disconnection is handled
            # during await websocket.send_text(message)
            websocket = self.connections.pop()
            await websocket.send_text(data)
            living_connections.append(websocket)
        self.connections = living_connections

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.connections.remove(websocket)

    def subscribe(self):
        """Listens for new Pub/Sub messages."""
        logging.info("subscribing to pubsub")
        future = self.pubsub.subscribe(
            CLOUD_BUILD_SUBSCRIPTION_ID, self._handle_message()
        )
        return future

    async def handle_message(self, message):
        data = json.loads(message.data, encoding="utf-8")
        return data

    def _handle_message(self):
        def callback(message):
            future = asyncio.run_coroutine_threadsafe(
                self.handle_message(message), loop
            )
            future.result()
            message.ack()

        return callback

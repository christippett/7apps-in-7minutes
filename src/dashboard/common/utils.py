import asyncio
import json
import logging
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional

import dateutil.parser
import google.auth
from fastapi import WebSocket
from google.auth.transport.requests import AuthorizedSession
from google.cloud import pubsub_v1
from requests import Session

from .constants import (
    CLOUD_BUILD_API,
    CLOUD_BUILD_SUBSCRIPTION_ID,
    CLOUD_BUILD_TRIGGER_ID,
    GITHUB_BRANCH,
    GITHUB_REPO,
)

logging.basicConfig(level=logging.INFO)

credentials, project = google.auth.default(
    scopes=["https://www.googleapis.com/auth/cloud-platform"],
)

loop = asyncio.get_event_loop()


def get_active_builds(session: Optional[Session] = None) -> List[Dict[str, Any]]:
    if session is None:
        session = AuthorizedSession(credentials)
    builds_query = {"filter": 'status="QUEUED" OR status="WORKING"'}
    project = "servian-labs-7apps"
    resp = session.get(
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


def trigger_build(
    substitutions: Dict[str, str], session: Optional[Session] = None
) -> str:
    if session is None:
        session = AuthorizedSession(credentials)

    source = {
        "repoName": GITHUB_REPO,
        "branchName": GITHUB_BRANCH,
        "substitutions": substitutions,
    }
    resp = session.post(f"{CLOUD_BUILD_API}/{CLOUD_BUILD_TRIGGER_ID}:run", json=source,)
    resp.raise_for_status()

    operation = resp.json()
    return operation["metadata"]["build"]["id"]


class PubSubMessageBroker:
    def __init__(self):
        self.connections: List[WebSocket] = list()
        self.pubsub = pubsub_v1.SubscriberClient()
        self.log_collection = defaultdict(lambda: deque(maxlen=50))
        self.generator = self.get_stream_generator()
        self.subscribe()

    async def get_stream_generator(self):
        while True:
            data = yield
            await self._send(data)

    async def send(self, data: str):
        await self.generator.asend(data)

    async def _send(self, data: str):
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

    async def handle_message(self, message):
        data = json.loads(message.data, encoding="utf-8")
        build_id = data["resource"]["labels"]["build_id"]
        log = {
            "build_step": data["labels"]["build_step"],
            "level": data["severity"],
            "text": data["textPayload"],
            "timestamp": data["timestamp"],
            "build_id": build_id,
        }
        self.log_collection[build_id].append(log)
        await self.send(json.dumps(log))

    def subscribe(self):
        """Listens for new Pub/Sub messages."""
        logging.info("subscribing to pubsub")
        future = self.pubsub.subscribe(
            CLOUD_BUILD_SUBSCRIPTION_ID, self._handle_message()
        )
        return future

    def _handle_message(self):
        def callback(message):
            future = asyncio.run_coroutine_threadsafe(
                self.handle_message(message), loop
            )
            future.result()
            message.ack()

        return callback

import json
import logging
import os
from collections import defaultdict
from typing import Any, Dict, Optional

import dateutil.parser
import gevent
import google.auth
from dotenv import load_dotenv
from google.auth.transport.requests import AuthorizedSession
from google.cloud import pubsub_v1
from requests import Session

load_dotenv()

GITHUB_REPO = os.getenv("GITHUB_REPO")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH")
CLOUD_BUILD_API = "https://cloudbuild.googleapis.com/v1"
CLOUD_BUILD_TRIGGER_ID = os.getenv("CLOUD_BUILD_TRIGGER_ID")
CLOUD_BUILD_SUBSCRIPTION_ID = os.getenv("CLOUD_BUILD_SUBSCRIPTION_ID")

credentials, project = google.auth.default(
    scopes=["https://www.googleapis.com/auth/cloud-platform"],
)


def get_active_builds(session: Optional[Session] = None) -> Dict[str, Any]:
    if session is None:
        session = AuthorizedSession(credentials)
    builds_query = {"filter": 'status="QUEUED" OR status="WORKING"'}
    project = "servian-labs-7apps"
    resp = session.get(
        f"{CLOUD_BUILD_API}/projects/{project}/builds", params=builds_query,
    )
    resp.raise_for_status()
    builds = resp.json().get("builds", [])
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


class CloudBuildLogHandler:
    def __init__(self):
        self.pubsub = pubsub_v1.SubscriberClient()
        self.build_logs = defaultdict(list)
        self.clients = list()

    def register(self, client):
        """Register a WebSocket connection Pub/Sub updates."""
        self.clients.append(client)

    def send(self, client, data):
        """Send given data to the registered client.
        Automatically discards invalid connections."""
        try:
            client.send(data)
        except Exception as e:
            logging.exception(e)
            self.clients.remove(client)

    def handle_message(self, message):
        data = json.loads(message.data, encoding="utf-8")
        build_id = data["resource"]["labels"]["build_id"]
        log_message = {
            "build_step": data["labels"]["build_step"],
            "level": data["severity"],
            "text": data["textPayload"],
            "timestamp": data["timestamp"],
            "build_id": build_id,
        }
        self.build_logs[build_id].append(log_message)
        for client in self.clients:
            client.send(json.dumps(log_message))

    def subscribe(self):
        """Listens for new Pub/Sub messages."""
        future = self.pubsub.subscribe(CLOUD_BUILD_SUBSCRIPTION_ID, self._callback())
        # try:
        #     future.result()
        # except Exception as e:
        #     logging.exception(e)
        #     self.pubsub.close()
        #     raise
        return future

    def start(self):
        """Maintains Pub/Sub subscription in the background."""
        gevent.spawn(self.subscribe)

    def _callback(self):
        def callback(message):
            logging.info(message)
            self.handle_message(message)
            message.ack()

        return callback

import json
import logging
import os
from collections import defaultdict, deque
from typing import Any, Dict, Optional

import dateutil.parser
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

logging.basicConfig(level=logging.INFO)

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
    def __init__(self, socketio_client):
        self.pubsub = pubsub_v1.SubscriberClient()
        self.build_logs = defaultdict(lambda: deque(maxlen=50))
        self.socketio = socketio_client
        logging.info("logging handler created")

    def handle_message(self, message):
        data = json.loads(message.data, encoding="utf-8")
        with open("logs.json", "a") as fp:
            fp.write(message.data.decode("utf-8"))
        build_id = data["resource"]["labels"]["build_id"]
        log_message = {
            "build_step": data["labels"]["build_step"],
            "level": data["severity"],
            "text": data["textPayload"],
            "timestamp": data["timestamp"],
            "build_id": build_id,
        }
        self.build_logs[build_id].append(log_message)
        self.socketio.emit("cloudbuild", json.dumps(log_message))

    def subscribe(self):
        """Listens for new Pub/Sub messages."""
        logging.info("subscribing to pubsub")
        future = self.pubsub.subscribe(CLOUD_BUILD_SUBSCRIPTION_ID, self._callback())
        # try:
        #     future.result()
        # except Exception as e:
        #     logging.exception(e)
        #     self.pubsub.close()
        #     raise
        return future

    def _callback(self):
        def callback(message):
            self.handle_message(message)
            message.ack()

        return callback

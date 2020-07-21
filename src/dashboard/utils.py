import os
from collections import defaultdict
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


def format_log_message(data: Dict[str, Any]) -> Dict[str, Any]:
    build_step = data["labels"]["build_step"]
    level = data["severity"]
    text = data["textPayload"]
    timestamp = dateutil.parser.parse(data["timestamp"])
    build_id = data["resource"]["labels"]["build_id"]
    return {"log": ""}


class LogStreamClientHandler:
    def __init__(self, subscription_path):
        self.client = pubsub_v1.SubscriberClient()
        self.build_logs = defaultdict(list)
        self.clients = list()


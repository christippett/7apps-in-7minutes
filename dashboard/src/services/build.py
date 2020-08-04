import asyncio
import logging
import os
import re
import sys
from typing import Dict, List

import google.auth
from google.auth.transport.requests import AuthorizedSession

from config import settings
from models.build import BuildRef

logger = logging.getLogger(__name__)

credentials, project = google.auth.default(
    scopes=["https://www.googleapis.com/auth/cloud-platform"],
)


class CloudBuildService:
    def __init__(self, notifier=None):
        self.notifier = notifier
        self.session = AuthorizedSession(credentials)
        self._logging = False

    def _googlesdk_cloudbuild_client(self):
        third_party_dir = os.path.join(settings.gcloud_dir, "lib", "third_party")
        if os.path.isdir(third_party_dir) and third_party_dir not in sys.path:
            sys.path.insert(0, third_party_dir)
        from googlecloudsdk.api_lib.cloudbuild import logs

        return logs.CloudBuildClient()

    def trigger_build(self, substitutions: Dict[str, str]) -> BuildRef:
        source = {
            "repoName": settings.github_repo,
            "branchName": settings.github_branch,
            "substitutions": substitutions,
        }
        resp = self.session.post(
            f"{settings.cloud_build_api_url}/{settings.cloud_build_trigger_id}:run",
            json=source,
        )
        resp.raise_for_status()
        data = resp.json()
        return BuildRef.parse_obj(data["metadata"]["build"])

    def get_build(self, id: str) -> BuildRef:
        resp = self.session.get(
            f"{settings.cloud_build_api_url}/projects/{project}/builds/{id}"
        )
        resp.raise_for_status()
        data = resp.json()
        return BuildRef.parse_obj(data)

    def get_active_builds(self) -> List[BuildRef]:
        builds_query = {"filter": 'status="QUEUED" OR status="WORKING"'}
        project = "servian-labs-7apps"
        resp = self.session.get(
            f"{settings.cloud_build_api_url}/projects/{project}/builds",
            params=builds_query,
        )
        resp.raise_for_status()
        data = resp.json()
        return [BuildRef.parse_obj(b) for b in data.get("builds", [])]

    async def get_logs(self, build_ref: BuildRef):
        if self._logging:
            return
        self._logging = True
        log_parser = self.parse_log_text
        notifier = self.notifier

        class _LogWriter:
            def Print(self, text):
                for t in text.split("\n"):
                    asyncio.run_coroutine_threadsafe(
                        notifier.send(topic="log", data=log_parser(t)), loop=loop
                    )

        cb = self._googlesdk_cloudbuild_client()
        proxy_logger = _LogWriter()
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, cb.Stream, build_ref, proxy_logger)
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

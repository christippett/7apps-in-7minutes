import asyncio
import logging
import os
import re
import sys
from asyncio.futures import Future
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional

import google.auth
import yaml
from fastapi import BackgroundTasks
from google.auth.transport.requests import AuthorizedSession
from pyfiglet import Figlet

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
        self.logging_futures = []

    def _googlesdk_cloudbuild_client(self):
        third_party_dir = os.path.join(settings.gcloud_dir, "lib", "third_party")
        if os.path.isdir(third_party_dir) and third_party_dir not in sys.path:
            sys.path.insert(0, third_party_dir)
        from googlecloudsdk.api_lib.cloudbuild import logs

        return logs.CloudBuildClient()

    def generate_yaml_config(self, build_ref: BuildRef) -> str:
        config = {
            "steps": [s.dict(exclude_unset=True) for s in build_ref.steps],
            "substitutions": build_ref.substitutions,
        }
        return yaml.dump(config, default_flow_style=False, sort_keys=False) or ""

    def has_active_builds(self) -> bool:
        return any([not f.done() for f in self.logging_futures])

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
        builds_query = {
            "filter": '(status="QUEUED" OR status="WORKING") AND tags="app"'
        }
        project = "servian-labs-7apps"
        resp = self.session.get(
            f"{settings.cloud_build_api_url}/projects/{project}/builds",
            params=builds_query,
        )
        resp.raise_for_status()
        data = resp.json()
        return [BuildRef.parse_obj(b) for b in data.get("builds", [])]

    async def send_log(self, text: Optional[str] = None, **extra):
        data = {"text": text}
        data.update(extra)
        await self.notifier.send(topic="log", data=data)

    async def capture_logs(self, build_ref: BuildRef):
        future = asyncio.ensure_future(self.get_logs(build_ref))
        self.logging_futures.append(future)

        def callback(f: Future):
            self.logging_futures.remove(f)
            if f.exception():
                logger.error("Error while getting Cloud Build logs: %s", f.exception())
            logger.info("Finished logging Cloud Build output")
            self.notifier.purge_history("log")

        future.add_done_callback(callback)

    async def get_logs(self, build_ref: BuildRef):
        if build_ref.id in self.logging_futures:
            return

        @dataclass
        class _LogWriter:
            logger: Callable
            parser: Callable

            # gcloud sdk expects a `Print` method
            def Print(self, text):
                for t in text.split("\n"):
                    asyncio.run_coroutine_threadsafe(
                        self.logger(**self.parser(t)), loop=loop
                    )

        logger.info("Getting Cloud Build logs")
        self.notifier.purge_history("log")
        header = Figlet(font="slant").renderText("Cloud Build")
        await self.send_log(header + "Logs to follow...\n\n")

        client = self._googlesdk_cloudbuild_client()
        loop = asyncio.get_event_loop()
        log_writer = _LogWriter(self.send_log, self.parse_log_text)
        await loop.run_in_executor(None, client.Stream, build_ref, log_writer)

    def parse_log_text(self, text):
        rec = {"text": text}

        # Extract log parts
        log_pattern = r"^(?P<type>Starting|Finished)? ?Step #(?P<step>\d{1,2}) - \"(?P<id>.*?)\"(?:\: (?P<text>.*)?)?$"
        log_match = re.match(log_pattern, text)
        if log_match:
            rec.update(log_match.groupdict())

        # Shorten section breaks, keeping any text centered
        divider_match = re.match(r"^[=-]{20,}([^-=]+)?", text)
        if divider_match:
            label = divider_match.group(1) or ""
            rec["type"] = "divider"
            rec["text"] = label.ljust(33 + (len(label) // 2), "-").rjust(66, "-")

        if text in ["FETCHSOURCE", "BUILD", "PUSH", "DONE"]:
            rec["type"] = "header"
        if re.match(r"[\s\.]+", text):
            rec["type"] = "linebreak"
        rec["text"] = re.sub(r"\.{4,}", r"...", rec.get("text") or text)
        return rec

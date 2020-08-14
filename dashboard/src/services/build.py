import asyncio
import logging
import os
import re
import sys
from asyncio.futures import Future
from collections import deque
from dataclasses import dataclass
from typing import Callable, Deque, Dict, List, Optional, Tuple
from uuid import uuid4

import yaml
from google.auth.transport.requests import AuthorizedSession
from pyfiglet import Figlet
from requests.exceptions import HTTPError

from config import settings
from models.build import BuildRef

logger = logging.getLogger(__name__)


class CloudBuildService:
    def __init__(self, notifier=None):
        self.notifier = notifier
        self.session = AuthorizedSession(settings.google_credentials)
        self._active_builds: Deque[Tuple[BuildRef, Future]] = deque(maxlen=10)

    def _googlesdk_cloudbuild_client(self):
        third_party_dir = os.path.join(settings.gcloud_dir, "lib", "third_party")
        if os.path.isdir(third_party_dir) and third_party_dir not in sys.path:
            sys.path.insert(0, third_party_dir)
        from googlecloudsdk.api_lib.cloudbuild import logs

        return logs.CloudBuildClient()

    def generate_config(self, build_ref: BuildRef) -> str:
        config = {
            "steps": [s.dict(exclude_unset=True) for s in build_ref.steps],
            "substitutions": build_ref.substitutions,
        }
        return yaml.dump(config, default_flow_style=False, sort_keys=False) or ""

    async def trigger_build(self, substitutions: Dict[str, str]) -> BuildRef:
        version = uuid4().hex[:7] + "-custom"
        substitutions.update({"_VERSION": version})
        source = {
            "repoName": settings.github_repo,
            "branchName": settings.github_branch,
            "substitutions": substitutions,
        }
        resp = self.session.post(
            f"{settings.cloud_build_api_url}/{settings.cloud_build_trigger_id}:run",
            json=source,
        )
        data = resp.json()
        if not resp.ok and "error" in data:
            raise HTTPError(data["error"]["message"], response=resp)
        else:
            resp.raise_for_status()
        return BuildRef.parse_obj(data["metadata"]["build"])

    def get_build(self, id: str) -> BuildRef:
        resp = self.session.get(
            f"{settings.cloud_build_api_url}/projects/{settings.google_project}/builds/{id}"
        )
        resp.raise_for_status()
        data = resp.json()
        return BuildRef.parse_obj(data)

    def get_active_builds(self) -> List[BuildRef]:
        builds_query = {
            "filter": '(status="QUEUED" OR status="WORKING") AND tags="app"'
        }
        resp = self.session.get(
            f"{settings.cloud_build_api_url}/projects/{settings.google_project}/builds",
            params=builds_query,
        )
        resp.raise_for_status()
        data = resp.json()
        return [BuildRef.parse_obj(b) for b in data.get("builds", [])]

    def active_builds(self) -> List[BuildRef]:
        active_builds = [b for b, f in self._active_builds if not f.done()]
        if not active_builds:
            active_builds = self.get_active_builds()
        return active_builds

    async def send_log(self, text: Optional[str] = None, **extra):
        data = {"text": text}
        data.update(extra)
        await self.notifier.send(topic="log", data=data)

    async def start_log_stream(self, build_ref: BuildRef):
        logger.info("Getting Cloud Build logs")
        self.notifier.purge_history("log")
        log_future = asyncio.ensure_future(self.stream_logs(build_ref))
        self._active_builds.append((build_ref, log_future))

    async def stream_logs(self, build_ref: BuildRef):
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

        fmt = Figlet(font="slant")
        await self.send_log(fmt.renderText("Cloud Build") + "Logs to follow...\n\n")

        client = self._googlesdk_cloudbuild_client()
        loop = asyncio.get_event_loop()
        log_writer = _LogWriter(self.send_log, self.parse_log_text)
        await loop.run_in_executor(None, client.Stream, build_ref, log_writer)
        await self.send_log(fmt.renderText("Done!"))

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

        if text in ["FETCHSOURCE", "BUILD", "PUSH", "DONE", "ERROR"]:
            rec["type"] = "header"
        if re.match(r"[\s\.]+", text):
            rec["type"] = "linebreak"
        rec["text"] = re.sub(r"\.{4,}", r"...", rec.get("text") or text)
        return rec

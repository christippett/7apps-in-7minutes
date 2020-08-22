import asyncio
import logging
import os
import re
import sys
from asyncio.futures import Future
from collections import defaultdict, deque
from dataclasses import dataclass
from enum import Enum
from typing import Callable, Deque, Dict, List, Optional, Tuple

import yaml
from google.auth.transport.requests import AuthorizedSession
from pyfiglet import figlet_format
from requests.exceptions import HTTPError

from config import settings
from models import Message
from models.build import BuildRef

logger = logging.getLogger("dashboard." + __name__)

Status = Enum("Status", "ACTIVE INACTIVE UNKNOWN")


class CloudBuildService:
    def __init__(self, notifier=None):
        self.notifier = notifier
        self.session = AuthorizedSession(settings.google_credentials)
        self._logs = defaultdict(list)
        self._active_builds: Deque[Tuple[BuildRef, Future]] = deque(maxlen=10)

    def _googlesdk_cloudbuild_client(self):
        third_party_dir = os.path.join(settings.gcloud_dir, "lib", "third_party")
        if os.path.isdir(third_party_dir) and third_party_dir not in sys.path:
            sys.path.insert(0, third_party_dir)
        from googlecloudsdk.api_lib.cloudbuild import logs

        return logs.CloudBuildClient()

    def generate_config(self, build: BuildRef) -> str:
        config = {
            "steps": [s.dict(exclude_unset=True) for s in build.steps],
            "substitutions": build.substitutions,
        }
        return yaml.dump(config, default_flow_style=False, sort_keys=False) or ""

    async def trigger_build(self, substitutions: Dict[str, str]) -> BuildRef:
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

    def active_builds(self, refresh=False) -> List[BuildRef]:
        active_builds = [b for b, f in self._active_builds if not f.done()]
        if not active_builds and refresh:
            active_builds = self.get_active_builds()
        return active_builds

    async def send_log(self, text: str, **data):
        message = Message("log", text=text, **data)
        await self.notifier.send(message=message)

    async def start_log_stream(self, build: BuildRef):
        if any(map(lambda b: b.id == build.id, self.active_builds())):
            logger.info("Build already accounted for - skipping logs")
            return
        logger.info("Getting Cloud Build logs")
        log_future = asyncio.ensure_future(self.stream_logs(build))
        self._active_builds.append((build, log_future))

    async def stream_logs(self, build: BuildRef):
        log_parser = self.parse_log_text
        log_store = self._logs
        send_log = self.send_log

        @dataclass
        class _LogWriter:
            # The gcloud SDK invokes a `Print` method internally to write its
            # output
            def Print(self, text):
                for t in text.split("\n"):
                    log = log_parser(t)
                    log_store[build.id].append(log)
                    asyncio.run_coroutine_threadsafe(send_log(**log), loop=loop)

        header = figlet_format(text="Cloud Build", font="slant")
        await self.send_log(header + "Starting log stream...\n\n")

        client = self._googlesdk_cloudbuild_client()
        loop = asyncio.get_event_loop()
        log_writer = _LogWriter()
        await loop.run_in_executor(None, client.Stream, build, log_writer)
        await self.send_log(figlet_format(text="Done!", font="straight"))

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

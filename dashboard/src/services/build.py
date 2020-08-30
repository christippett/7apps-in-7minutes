import asyncio
import logging
from asyncio.futures import Future
from collections import defaultdict, deque
from enum import Enum
from typing import Deque, Dict, List, Optional, Tuple

from google.api_core.exceptions import ClientError
from googleapiclient import discovery
from pyfiglet import figlet_format

from common.config import settings
from common.utils import execute_api_request
from models.build import BuildRef, LogRecord, LogSection, LogType
from services.notifier import Notifier

logger = logging.getLogger("dashboard." + __name__)

Status = Enum("Status", "ACTIVE INACTIVE UNKNOWN")


class CloudBuildLogger:
    def __init__(self, build: BuildRef, cloudbuild: "CloudBuildService"):
        self.build = build
        self.cloudbuild = cloudbuild
        self.log_file = self.get_log_blob(build)
        self.cursor: int = 0
        self._current_section: Optional[LogSection] = None

    def get_log_blob(self, build: BuildRef):
        _, _, bucket_name = self.build.logsBucket.rpartition("gs://")
        bucket = settings.gcp.storage.bucket(bucket_name)
        return bucket.blob(f"log-{build.id}.txt")

    def build_is_active(self):
        self.build = self.cloudbuild.get_build(self.build.id)
        return self.build.status in ("WORKING", "QUEUED")

    async def stream_logs(self):
        separator = LogRecord(text="-" * 120, section=LogSection.Header)

        # Send header
        header = figlet_format("Cloud Build", font="colossal").lstrip("\n").rstrip()
        yield LogRecord(text=header, type=LogType.AsciiArt, section=LogSection.Header)
        yield LogRecord(text="Streaming Cloud Build logs", section=LogSection.Header)
        yield separator

        # Poll Cloud Storage for logs
        is_active = self.build_is_active()
        is_final = False
        while is_active or is_final:
            await asyncio.sleep(1)
            async for log in self.get_logs():
                yield log
            if is_final:
                break
            is_active = self.build_is_active()
            is_final = not is_active

        # Send footer
        footer = figlet_format("Done!", font="cosmic").strip("\n")
        yield separator
        yield LogRecord(text=footer, type=LogType.AsciiArt, section=LogSection.Footer)
        yield LogRecord(text="Deployment complete!", section=LogSection.Footer)

    async def get_logs(self):
        try:
            body = self.log_file.download_as_string(start=self.cursor)
        except ClientError:
            return
        self.cursor += len(body)
        log_lines = body.decode().rstrip("\n").split("\n")
        for text in log_lines:
            log_record = LogRecord(text=text, section=self._current_section)
            self._current_section = log_record.section
            yield log_record
            await asyncio.sleep(0)


class CloudBuildService:
    def __init__(self, notifier: Notifier):
        self.notifier = notifier
        self.client = discovery.build("cloudbuild", "v1")
        self.logs_history = defaultdict(list)
        self._active_builds: Deque[Tuple[BuildRef, Future]] = deque(maxlen=10)

    def trigger_build(self, substitutions: Dict[str, str]) -> BuildRef:
        body = {
            "repoName": settings.github_repo,
            "branchName": settings.github_branch,
            "substitutions": substitutions,
        }
        req = (
            self.client.projects()
            .triggers()
            .run(
                projectId=settings.gcp.project,
                triggerId=settings.cloud_build_trigger_id,
                body=body,
            )
        )
        data = execute_api_request(req)
        return BuildRef.parse_obj(data["metadata"]["build"])

    def get_build(self, id: str) -> BuildRef:
        req = self.client.projects().builds().get(projectId=settings.gcp.project, id=id)
        data = execute_api_request(req)
        return BuildRef.parse_obj(data)

    def get_active_builds(self) -> List[BuildRef]:
        req = (
            self.client.projects()
            .builds()
            .list(
                projectId=settings.gcp.project,
                filter='(status="QUEUED" OR status="WORKING") AND tags="app"',
                pageSize=3,
            )
        )
        data = execute_api_request(req)
        return list(map(BuildRef.parse_obj, data.get("builds", [])))

    async def stream_logs(self, build: BuildRef):
        if build.id in self.logs_history:
            logger.debug("Log stream already in-progress for build: %s", build.id)
            return

        logger.info("Starting streaming logs for build: %s", build.id, icon="🚿")
        await self.notifier.send("build", id=build.id, status="started")
        await asyncio.sleep(0.5)

        cloudbuild_logger = CloudBuildLogger(build, self)
        async for log in cloudbuild_logger.stream_logs():
            self.logs_history[build.id].append(log)
            await self.notifier.send("log", log, opts={"exclude": {"raw"}})

        await self.notifier.send("build", id=build.id, status="finished")
        logger.info("Finished streaming logs for build: %s", build.id, icon="🛁")

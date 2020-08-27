import asyncio
import logging
import re
from asyncio.futures import Future
from datetime import datetime, timezone
from typing import List, Tuple, cast
from uuid import uuid4

import aiohttp
import petname
import yaml
from aiohttp.client import ClientSession
from aiohttp.typedefs import LooseHeaders

from common.config import settings
from common.utils import future_exception_handler
from models.app import App, AppList, Theme
from models.build import BuildRef
from services.build import CloudBuildService
from services.notifier import Notifier

logger = logging.getLogger("dashboard." + __name__)

DEFAULT_HEADERS = cast(LooseHeaders, {"Accept": "application/json"})


class AppService:
    def __init__(self, apps: List[App], notifier: Notifier):
        self.apps = AppList(__root__=apps)
        self.notifier = notifier
        self.build = CloudBuildService(notifier=notifier)
        self.active_poll = None

    @classmethod
    def load_from_config(cls, path, notifier: Notifier):
        with open(path) as fp:
            config = yaml.safe_load(fp)
        apps = [
            a
            for a in map(App.parse_obj, config["apps"])
            if a.id != "localhost" or settings.debug
        ]
        return cls(apps=apps, notifier=notifier)

    async def deploy(self, theme: Theme) -> Tuple[str, BuildRef]:
        active_builds = self.build.get_active_builds()
        if len(active_builds) > 0:
            logger.warning(
                "Skipping deployment: %s build(s) already in progress",
                len(active_builds),
            )
            build = active_builds[0]
            version = build.substitutions.get("_VERSION") or ""
        else:
            version = petname.Generate() or uuid4().hex[:10]
            substitutions = {
                "_GRADIENT": theme.gradient,
                "_FONT": theme.font or "",
                "_ASCII_FONT": theme.ascii_font or "",
                "_VERSION": version,
            }
            build = await self.build.trigger_build(substitutions)
            logger.info("Deployment started for version %s", version)
        return version, build

    async def fetch_app(self, app: App, session: ClientSession) -> App:
        async with session.get(app.url) as response:
            data = await response.json()
            data.update(app.dict(include={"id", "title", "url"}))
            return App.parse_obj(data)

    async def refresh_app_data(self):
        async with aiohttp.ClientSession(headers=DEFAULT_HEADERS) as session:
            for app in self.apps:
                try:
                    self.apps.replace(await self.fetch_app(app, session))
                except aiohttp.ClientError as exc:
                    logger.warning("Unable to update %s: %s", app, exc)

    async def poll_for_version(self, app: App, version: str, interval=1,) -> App:
        version_confirmation = 0
        consecutive_errors = 0
        async with aiohttp.ClientSession(
            headers=DEFAULT_HEADERS, raise_for_status=True
        ) as session:
            while True:
                await asyncio.sleep(interval)
                notify = False
                try:
                    app = await self.fetch_app(app, session)
                    notify = consecutive_errors >= 5
                    consecutive_errors = 0
                except aiohttp.ClientError:
                    notify = consecutive_errors == 0
                    consecutive_errors += 1
                except RuntimeError as exc:
                    logger.warning("Exception raised during version polling: %s", exc)
                finally:
                    version_confirmation += 1 if app.version == version else 0
                    if version_confirmation >= 2:
                        return app
                    if notify:
                        await self.notifier.send("refresh-app", app=app)

    async def poll_all_for_version(self, version: str, build: BuildRef):
        logger.info("Polling applications for version %s", version, icon="⏳")
        started = build.createTime
        tasks: List[Future[App]] = []
        for app in self.apps:
            task = self.poll_for_version(app, version)
            tasks.append(asyncio.create_task(task))
        for f in asyncio.as_completed(tasks, timeout=600):
            app = await f
            self.apps.replace(app)
            now = datetime.utcnow().replace(tzinfo=timezone.utc)
            duration = round((now - started).total_seconds(), 2)
            await self.notifier.send(
                "app-updated",
                app=app,
                version=version,
                started=started,
                finished=now,
                duration=duration,
            )
            logger.info("%s updated after %ss", app, duration, icon="✨")
        logger.info("Finished polling for version %s", version, icon="⏳")

    async def start_polling_for_version(self, version: str, build: BuildRef):
        if self.active_poll is not None and not self.active_poll.done():
            logger.warning("Active poll already in progress")
            return
        self.active_poll = asyncio.ensure_future(
            self.poll_all_for_version(version, build)
        )
        self.active_poll.add_done_callback(future_exception_handler)
        return self.active_poll

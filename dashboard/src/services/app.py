import asyncio
import logging
import re
from datetime import datetime
from typing import List, Tuple, cast
from uuid import uuid4

import aiohttp
import yaml
from aiohttp.client import ClientSession
from aiohttp.typedefs import LooseHeaders

from models import App, AppList, AppTheme, Message
from models.build import BuildRef
from services.build import CloudBuildService
from services.notifier import Notifier
from utils import future_exception_handler

logger = logging.getLogger("dashboard." + __name__)


class AppService:
    def __init__(self, apps: List[App], notifier: Notifier = None):
        self.apps = AppList(__root__=apps)
        self.notifier = notifier
        self.build = CloudBuildService(notifier=notifier)
        self._active_monitor = None

    @classmethod
    def load_from_config(cls, path, notifier: Notifier = None):
        with open(path) as fp:
            config = yaml.safe_load(fp)
        apps = [App.parse_obj(app) for app in config["apps"]]
        return cls(apps=apps, notifier=notifier)

    async def deploy(self, theme: AppTheme) -> Tuple[str, BuildRef]:
        active_builds = self.build.active_builds(refresh=True)
        if len(active_builds) > 0:
            logger.warning(
                "Skipping deployment: %s build(s) already in progress",
                len(active_builds),
            )
            build = active_builds[0]
            version = build.substitutions.get("_VERSION") or ""
            await self.build.start_log_stream(build)
        else:
            version = (
                re.sub(r"[^\w]+", "-", theme.gradient.name).lower()
                + "-"
                + uuid4().hex[:7]
            )
            substitutions = {
                "_GRADIENT": theme.gradient.name,
                "_FONT": theme.font or "",
                "_ASCII_FONT": theme.ascii_font or "",
                "_VERSION": version,
            }
            logger.info("Deploying new version: %s", version)
            build = await self.build.trigger_build(substitutions)
        return version, build

    async def fetch_app(self, app: App, session: ClientSession) -> App:
        async with session.get(app.url) as response:
            response.raise_for_status()
            data = await response.json()
            app_copy = app.copy(update=data)
            app_copy.updated = datetime.utcnow()
            return app_copy

    async def update_apps(self):
        headers = cast(LooseHeaders, {"Accept": "application/json"})
        tasks = []
        async with aiohttp.ClientSession(headers=headers) as session:
            for current_app in self.apps:
                task = self.fetch_app(current_app, session)
                tasks.append(asyncio.ensure_future(task))
            results = await asyncio.gather(*tasks, return_exceptions=True)
        for app in [r for r in results if isinstance(r, App)]:
            self.apps.replace(app)

    async def start_monitor(self, version: str, build: BuildRef):
        if self._active_monitor is not None and not self._active_monitor.done():
            return
        self._active_monitor = asyncio.ensure_future(self._monitor(version, build))
        self._active_monitor.add_done_callback(future_exception_handler)
        return self._active_monitor

    async def _monitor(self, version: str, build: BuildRef):
        logger.info("👀 Starting application monitor")
        raise Exception("test error")
        await self.notifier.send(Message("build", status="started", version=version))

        # Use Cloud Build's creation time for calculating app's update duration
        start_time = build.createTime.replace(tzinfo=None)
        interval = 10
        timeout = 600
        old_apps = self.apps.copy(deep=True)
        while True:
            timer = int((datetime.utcnow() - start_time).total_seconds())
            await self.update_apps()

            # Limit logs to once every 30s
            if timer % 30 < interval:
                logger.info("⏳ Polling applications (%ss elapsed)", timer)
                for v, apps in self.apps.versions().items():
                    logger.info("[%s]: %s", v, ", ".join(map(str, apps)))

            # Process updated app(s)
            for app in old_apps:
                latest_app = self.apps.get(app.name)
                if latest_app.version != version:
                    continue
                logger.info(
                    "✨ %s updated after %ss (%s -> %s)",
                    app,
                    timer,
                    app.version,
                    version,
                )
                message = Message(
                    "refresh-app", version=version, app=latest_app, duration=timer,
                )
                await self.notifier.send(message=message)
                old_apps.remove(app)  # remove from poll rotation

            # Should we keep polling?
            if all(map(lambda a: a.version == version, self.apps)):
                logger.info("🎉 All applications updated (%s)", version)
                break
            elif timer > timeout or self.build.active_builds() == 0:
                logging.warning("⌛ Stopping monitor after %ss", timeout)
                break
            await asyncio.sleep(interval)
        await self.notifier.send(
            Message("build", status="finished", version=version, duration=timer)
        )

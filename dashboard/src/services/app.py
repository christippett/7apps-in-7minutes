import asyncio
import logging
from collections import defaultdict, deque
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

import aiohttp
import yaml
from aiohttp.client import ClientSession
from fastapi.encoders import jsonable_encoder

from models import App, AppTheme
from models.build import BuildRef
from services.build import CloudBuildService
from services.notifier import Notifier

logger = logging.getLogger(__name__)


Status = Enum("Status", "ACTIVE INACTIVE")


class AppService:
    def __init__(self, notifier: Notifier = None, **apps: App):
        self.apps = apps
        self.notifier = notifier
        self.build = CloudBuildService(notifier=notifier)
        self._history = defaultdict(lambda: deque(maxlen=5))
        self._current_version = None
        self._monitor_future = None

    @classmethod
    def load_from_config(cls, path, notifier: Notifier = None):
        with open(path) as fp:
            config = yaml.safe_load(fp)
        apps = {app["name"]: App.construct(**app) for app in config["apps"]}
        return cls(notifier=notifier, **apps)

    def get_apps(self) -> List[App]:
        return list(self.apps.values())

    def get_app(self, name: str) -> Optional[App]:
        return self.apps.get(name)

    def latest_version(self):
        return list(sorted(self.apps.values(), key=lambda app: app.updated))[0].version

    def deploy_update(self, theme: AppTheme):
        active_builds = self.build.get_active_builds()
        if len(active_builds) > 0:
            logger.warning(
                "Skipping deployment, %s builds already in progress",
                len(active_builds),
            )
            build_ref = active_builds[0]
        else:
            logger.info("Triggering new deployment with payload: %s", theme)
            build_ref = self.build.trigger_build(theme.get_build_substitutions())
        return build_ref

    async def request_app(self, app: App, session: ClientSession) -> App:
        logger.debug("Requesting data from application '%s'", app.name)
        async with session.get(app.url) as response:
            data = await response.json()
            app_copy = app.copy(update=data)
            app_copy.updated = datetime.utcnow()
            return app_copy

    async def get_latest_app_data(self) -> Dict[str, App]:
        headers = {"Accept": "application/json"}
        tasks = []
        async with aiohttp.ClientSession(headers=headers) as session:
            for app in self.apps.values():
                task = self.request_app(app, session)
                tasks.append(asyncio.ensure_future(task))
            latest = await asyncio.gather(*tasks)
        return dict(zip(self.apps.keys(), latest))

    async def refresh_app_data(self):
        self.apps = await self.get_latest_app_data()
        self._current_version = self.latest_version()

    async def poll_apps(self, interval=5):
        start_time = datetime.utcnow()
        while True:
            if (datetime.utcnow() - start_time).total_seconds() > 600:
                logging.error("Application monitor timed out")
                break
            latest = await self.get_latest_app_data()
            for name, app in self.apps.items():
                latest_app = latest[name]
                if (
                    app.version != latest_app.version
                    and latest_app.version != self._current_version
                ):
                    logger.info(
                        "New version detected for '%s' (%s vs %s)",
                        app.name,
                        app.version,
                        latest_app.version,
                    )
                    duration = datetime.utcnow() - start_time
                    self.apps[name] = latest_app
                    self._history[name].appendleft(app)
                    await self.notifier.send(
                        topic="refresh-app",
                        data={
                            "app": jsonable_encoder(latest_app),
                            "duration": duration.total_seconds(),
                        },
                    )
            versions = list(set([app.version for app in latest.values()]))
            if len(versions) == 1 and versions[0] != self._current_version:
                new_version = versions[0]
                logger.info("All applications updated to version %s", new_version)
                self._current_version = new_version
                break
            await asyncio.sleep(interval)
        await self.stop_status_monitor()

    def monitoring_status(self) -> bool:
        if self._monitor_future is None:
            return Status.INACTIVE
        return Status.INACTIVE if self._monitor_future.done() else Status.ACTIVE

    async def start_status_monitor(self, build_ref: BuildRef, interval=5):
        if self.monitoring_status() == Status.INACTIVE:
            logging.info("Starting application monitor")
            self.notifier.purge_history()  # start fresh
            self._log_future = asyncio.ensure_future(self.build.get_logs(build_ref))
            self._monitor_future = asyncio.ensure_future(self.poll_apps())

    async def stop_status_monitor(self):
        if self.monitoring_status() == Status.ACTIVE:
            logger.info("Stopping application monitor")
            self._monitor_future.cancel()
        else:
            logging.debug("Application monitor not running")

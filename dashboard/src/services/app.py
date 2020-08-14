import asyncio
import logging
import random
from collections import defaultdict, deque
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Union, cast

import aiohttp
import requests
import yaml
from aiohttp.client import ClientSession
from aiohttp.typedefs import LooseHeaders
from pyfiglet import FigletFont, figlet_format

from config import settings
from models import App, AppTheme
from models.build import BuildRef
from services.build import CloudBuildService
from services.notifier import Notifier

logger = logging.getLogger(__name__)

Status = Enum("Status", "ACTIVE INACTIVE UNKNOWN")


class AppService:
    def __init__(self, notifier: Notifier = None, **apps: App):
        self.apps = apps
        self.notifier = notifier
        self.build = CloudBuildService(notifier=notifier)
        self._history = defaultdict(lambda: deque(maxlen=5))
        self._current_version = None
        self._build_future = None
        self._theme_option_limit = 15

    @classmethod
    def load_from_config(cls, path, notifier: Notifier = None):
        with open(path) as fp:
            config = yaml.safe_load(fp)
        apps = {app["name"]: App.parse_obj(app) for app in config["apps"]}
        return cls(notifier=notifier, **apps)

    def get_gradients(self) -> List[Dict[str, Any]]:
        resp = requests.get(
            "https://raw.githubusercontent.com/ghosh/uiGradients/master/gradients.json"
        )
        return resp.json()

    def get_ascii_fonts(self, max_height=15) -> List[str]:
        fonts = FigletFont.getFonts()
        return [
            f
            for f in fonts
            if len(figlet_format("7Apps", font=f).split("\n")) <= max_height
        ]

    def get_google_fonts(self) -> List[str]:
        resp = requests.get(
            "https://www.googleapis.com/webfonts/v1/webfonts",
            params={
                "key": settings.google_api_key,
                "fields": "items.family,items.category",
                "sort": "popularity",
            },
            headers={"Referer": "7apps.cloud"},
        )
        data = resp.json()
        if not resp.ok:
            logger.error("Unable to get Google Fonts (%s)", resp.status_code)
            return ["Permanent Marker", "Staatliches", "Luckiest Guy"]
        return [
            f["family"]
            for f in data["items"]
            if f["category"] in ["handwriting", "display"]
        ]

    @property
    def gradients(self):
        if not hasattr(self, "_gradients"):
            self._gradients = [
                g["name"]
                for g in random.choices(
                    self.get_gradients(), k=self._theme_option_limit
                )
            ]
        return self._gradients

    @property
    def google_fonts(self):
        if not hasattr(self, "_google_fonts"):
            self._google_fonts = random.choices(
                self.get_google_fonts(), k=self._theme_option_limit
            )
        return self._google_fonts

    @property
    def ascii_fonts(self):
        if not hasattr(self, "_ascii_fonts"):
            self._ascii_fonts = random.choices(
                self.get_ascii_fonts(), k=self._theme_option_limit
            )
        return self._ascii_fonts

    @property
    def app_names(self) -> List[str]:
        return [app.name for app in self.apps.values()]

    def latest_version(self):
        return list(sorted(self.apps.values(), key=lambda app: app.updated))[0].version

    async def start_deployment(self, theme: AppTheme):
        active_builds = self.build.get_active_builds()
        if len(active_builds) > 0:
            logger.warning(
                "Skipping deployment, %s build(s) already in progress",
                len(active_builds),
            )
            build_ref = active_builds[0]
        else:
            logger.info("Triggering new deployment with payload: %s", theme.json())
            build_ref = await self.build.trigger_build(theme.get_build_substitutions())
        return build_ref

    async def request_app(self, app: App, session: ClientSession) -> App:
        async with session.get(app.url) as response:
            data = await response.json()
            app_copy = app.copy(update=data)
            app_copy.updated = datetime.utcnow()
            return app_copy

    async def get_latest_app_data(self) -> Dict[str, App]:
        headers = cast(LooseHeaders, {"Accept": "application/json"})
        tasks = []
        async with aiohttp.ClientSession(headers=headers) as session:
            for app in self.apps.values():
                task = self.request_app(app, session)
                tasks.append(asyncio.ensure_future(task))
            latest = await asyncio.gather(*tasks, return_exceptions=True)
        apps = dict(zip(self.apps.keys(), latest))
        return {name: app for name, app in apps.items() if isinstance(app, App)}

    async def refresh_app_data(self):
        self.apps.update(await self.get_latest_app_data())

    async def poll_apps(self, build_ref: BuildRef, interval=10):
        await self.refresh_app_data()
        start_time = datetime.utcnow()
        current_apps = list(self.apps.values())
        current_version = self.latest_version()
        while True:
            timer = int((datetime.utcnow() - start_time).total_seconds())
            if timer > 600:
                logging.error("Application monitor timed out")
                break
            latest_apps = await self.get_latest_app_data()
            latest_versions = set([app.version or "" for app in latest_apps.values()])
            latest_version = next(iter(latest_versions))
            logger.debug(
                "%s -vs- %s (⏳ %ss)", latest_version, ", ".join(latest_versions), timer
            )
            for app in current_apps:
                latest_app = latest_apps.get(app.name)
                logger.debug("[%s] %s", app.name, app.version)
                if (
                    latest_app is not None
                    and app.version is not None
                    and app.version != latest_app.version
                    and latest_app.version != current_version
                    and latest_app.updated > start_time
                ):
                    logger.info(
                        "[%s] Update complete (%s -> %s)",
                        app.name,
                        app.version,
                        latest_app.version,
                    )
                    self.apps[app.name] = latest_app
                    self._history[app.name].appendleft(app)
                    current_apps.remove(app)  # remove app from poll rotation
                    await self.notifier.send(
                        topic="refresh-app",
                        data={
                            "build": build_ref.dict(),
                            "app": latest_app.dict(),
                            "duration": timer,
                        },
                    )
            if len(latest_versions) == 1 and latest_version != current_version:
                logger.info(
                    "All applications updated (%s -> %s)",
                    current_version,
                    latest_version,
                )
                break
            elif self.build.active_builds() == 0:
                logger.warning(
                    "Stopping monitor early (%s)", ", ".join(latest_versions)
                )
                break
            await asyncio.sleep(interval)
        await self.stop_build_monitor()

    def deployment_status(self, as_string=False) -> Union[str, Status]:
        if self._build_future is None:
            status = Status.INACTIVE
        else:
            status = Status.INACTIVE if self._build_future.done() else Status.ACTIVE
        return status.name if as_string else status

    async def start_build_monitor(self, build_ref: BuildRef, interval=10):
        if self.deployment_status() == Status.INACTIVE:
            logging.info("Starting application monitor")
            await self.notifier.send(
                topic="build", data={"status": "starting"},
            )
            self._build_future = asyncio.ensure_future(self.poll_apps(build_ref))

    async def stop_build_monitor(self):
        if self.deployment_status() == Status.ACTIVE:
            logger.info("Stopping application monitor")
            await self.notifier.send(
                topic="build", data={"status": "finished"},
            )
            self._build_future.cancel()
        else:
            logging.debug("Application monitor not running")

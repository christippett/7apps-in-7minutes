import asyncio
import logging
import random
from collections import defaultdict, deque
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

import aiohttp
import requests
import yaml
from aiohttp.client import ClientSession
from pyfiglet import FigletFont, figlet_format

from config import settings
from models import App, AppTheme
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
                "Skipping deployment, %s build(s) already in progress",
                len(active_builds),
            )
            build_ref = active_builds[0]
        else:
            logger.info("Triggering new deployment with payload: %s", theme.json())
            build_ref = self.build.trigger_build(theme.get_build_substitutions())
        return build_ref

    async def request_app(self, app: App, session: ClientSession) -> App:
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
            latest = await asyncio.gather(*tasks, return_exceptions=True)
        apps = dict(zip(self.apps.keys(), latest))
        return {name: app for name, app in apps.items() if isinstance(app, App)}

    async def refresh_app_data(self):
        self.apps.update(await self.get_latest_app_data())

    async def poll_apps(self, interval=5):
        self.refresh_app_data()
        start_time = datetime.utcnow()
        current_apps = list(self.apps.values())
        current_version = self.latest_version()
        logger.info("Polling apps for updates (latest version is %s)", current_version)
        while True:
            if (datetime.utcnow() - start_time).total_seconds() > 600:
                logging.error("Application monitor timed out")
                break
            latest_apps = await self.get_latest_app_data()
            versions = set([app.version or "" for app in latest_apps.values()])
            logger.info("App version(s) after refresh: %s", ", ".join(versions))
            for app in current_apps:
                name = app.name
                latest_app = latest_apps.get(name)
                if (
                    latest_app
                    and app.version != latest_app.version
                    and latest_app.version != current_version
                    and latest_app.updated > start_time
                ):
                    logger.info(
                        "'%s' updated to version %s", name, latest_app.version,
                    )
                    duration = (datetime.utcnow() - start_time).total_seconds()
                    self.apps[name] = latest_app
                    self._history[name].appendleft(app)
                    current_apps.remove(app)
                    if app.version is not None:
                        await self.notifier.send(
                            topic="refresh-app",
                            data={"app": latest_app.dict(), "duration": duration},
                        )
            a_version = next(iter(versions))
            if len(versions) == 1 and a_version != current_version:
                new_version = a_version
                logger.info("All applications updated to version %s", new_version)
                break
            await asyncio.sleep(interval)
        await self.stop_app_monitor()

    def monitoring_status(self) -> bool:
        if self._monitor_future is None:
            return Status.INACTIVE
        return Status.INACTIVE if self._monitor_future.done() else Status.ACTIVE

    async def start_app_monitor(self, interval=5):
        if self.monitoring_status() == Status.INACTIVE:
            logging.info("Starting application monitor")
            await self.notifier.send(
                topic="build", data={"status": "starting"},
            )
            self._monitor_future = asyncio.ensure_future(self.poll_apps())

    async def stop_app_monitor(self):
        if self.monitoring_status() == Status.ACTIVE:
            logger.info("Stopping application monitor")
            await self.notifier.send(
                topic="build", data={"status": "finished"},
            )
            self._monitor_future.cancel()
        else:
            logging.debug("Application monitor not running")

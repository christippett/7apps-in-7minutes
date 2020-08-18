import random
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests
from colour import Color
from pydantic import BaseModel
from pydantic.color import Color as ColorField
from pydantic.fields import Field
from pyfiglet import FigletFont, figlet_format

from config import settings


class Gradient(BaseModel):
    name: str
    colors: List[ColorField]


class AppTheme(BaseModel):
    """ Application configuration that mostly impacts its visual style """

    gradient: Gradient
    ascii_font: Optional[str]
    font: Optional[str]

    @classmethod
    def random(cls, count=20) -> List["AppTheme"]:
        all_gradients = list(filter(lambda g: g["vibrant"], cls.get_gradients()))
        all_fonts = cls.get_fonts()
        all_ascii_fonts = cls.get_ascii_fonts()

        limit = min(count, len(all_gradients), len(all_fonts), len(all_ascii_fonts))
        gradients = [Gradient(**g) for g in random.choices(all_gradients, k=limit)]
        fonts = random.choices(all_fonts, k=limit)
        ascii_fonts = random.choices(all_ascii_fonts, k=limit)
        return [
            cls(gradient=gradients[i], font=fonts[i], ascii_font=ascii_fonts[i])
            for i in range(0, limit)
        ]

    @classmethod
    def get_gradients(cls) -> List[Dict[str, Any]]:
        if not hasattr(cls, "_gradients"):
            resp = requests.get(
                "https://raw.githubusercontent.com/ghosh/uiGradients/master/gradients.json"
            )
            data = resp.json()
            for gradient in data:
                try:
                    colors = [Color(c) for c in gradient["colors"]]
                    gradient["vibrant"] = (
                        min([c.get_saturation() for c in colors]) > 0.8
                        and min([c.get_luminance() for c in colors]) < 0.5
                    )
                except ValueError:
                    gradient["vibrant"] = False
            cls._gradients = data
        return cls._gradients

    @classmethod
    def get_ascii_fonts(cls, max_height=15) -> List[str]:
        if not hasattr(cls, "_ascii_fonts"):
            fonts = FigletFont.getFonts()
            cls._ascii_fonts = [
                f
                for f in fonts
                if len(figlet_format("7Apps", font=f).split("\n")) <= max_height
            ]
        return cls._ascii_fonts

    @classmethod
    def get_fonts(cls) -> List[str]:
        if not hasattr(cls, "_fonts"):
            resp = requests.get(
                "https://www.googleapis.com/webfonts/v1/webfonts",
                params={
                    "key": settings.google_api_key,
                    "fields": "items.family,items.category",
                    "sort": "popularity",
                },
                headers={"Referer": "7apps.cloud"},
            )
            resp.raise_for_status()
            data = resp.json()
            cls._fonts = [
                f["family"]
                for f in data["items"]
                if f["category"] in ["handwriting", "display"]
            ]
        return cls._fonts


class App(BaseModel):
    name: str
    title: str
    url: str
    version: Optional[str]
    theme: Optional[AppTheme]
    updated: datetime = Field(default_factory=datetime.utcnow)

    def __str__(self):
        return self.name


class AppList(BaseModel):
    __root__: List[App]

    def __iter__(self):
        return iter(self.__root__)

    def __contains__(self, key: str) -> bool:
        return self.get(key) is not None

    def __getitem__(self, key):
        return self.__root__[key]

    def get(self, name: str) -> Optional[App]:
        f = list(filter(lambda v: v.name == name, self.__root__))
        return f[0] if f else None

    def replace(self, app: App):
        current_app = self.get(app.name)
        if current_app:
            self.__root__.remove(current_app)
        self.__root__.append(app)

    def remove(self, app: App):
        self.__root__.remove(app)

    def versions(self) -> Dict[str, List[App]]:
        versions = defaultdict(list)
        for app in self.__root__:
            versions[app.version or "unknown"].append(app)
        return dict(versions)

    def latest_version(self) -> Optional[str]:
        if len(self.__root__) > 0:
            sorted_apps = list(sorted(self, key=lambda app: app.updated, reverse=True))
            return sorted_apps[0].version
        return None


class Message(BaseModel):
    topic: str
    data: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

    class Config:
        extra = "allow"

    def __init__(self, topic: str, **kwargs: Any):
        metadata = kwargs.pop("metadata", {})
        metadata.update({"timestamp": datetime.utcnow()})
        super().__init__(topic=topic, metadata=metadata, data=kwargs)

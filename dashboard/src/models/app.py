import random
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests
from colour import Color
from pydantic import BaseModel, validator
from pydantic.fields import Field
from pyfiglet import FigletFont
from pyfiglet import figlet_format as fmt

from common.config import settings


class Theme(BaseModel):
    """ ApplicTheme properties that modify the application's visual style """

    font: str
    ascii_font: str
    gradient: str
    colors: Optional[List[str]]

    @classmethod
    def random(cls, count=20) -> List["Theme"]:
        all_gradients = list(filter(lambda g: g["vibrant"], cls.get_gradients()))
        all_fonts = cls.get_fonts()
        all_ascii_fonts = cls.get_ascii_fonts()

        limit = min(count, len(all_gradients), len(all_fonts), len(all_ascii_fonts))
        gradients = [g["name"] for g in random.choices(all_gradients, k=limit)]
        fonts = random.choices(all_fonts, k=limit)
        ascii_fonts = random.choices(all_ascii_fonts, k=limit)
        return [
            cls(gradient=gradients[i], font=fonts[i], ascii_font=ascii_fonts[i])
            for i in range(0, limit)
        ]

    @classmethod
    def get_fonts(cls) -> List[str]:
        if hasattr(cls, "_fonts"):
            return cls._fonts
        url = "https://www.googleapis.com/webfonts/v1/webfonts"
        resp = requests.get(
            url,
            params={
                "key": settings.google_fonts_api_key,
                "fields": "items.family,items.category,items.variants,items.subsets",
                "sort": "popularity",
            },
            headers={"Referer": "7apps.cloud"},
        )
        resp.raise_for_status()
        data = resp.json()
        fonts = filter(
            lambda f: f["category"] in ["handwriting", "display"]
            and "regular" in f["variants"]
            and "latin" in f["subsets"],
            data["items"],
        )
        cls._fonts = list(map(lambda f: f["family"], fonts))
        return cls._fonts

    @classmethod
    def get_ascii_fonts(cls, max_height=15) -> List[str]:
        if hasattr(cls, "_ascii_fonts"):
            return cls._ascii_fonts
        fonts = FigletFont.getFonts()
        cls._ascii_fonts = [
            f for f in fonts if len(fmt("7Apps", font=f).split("\n")) <= max_height
        ]
        return cls._ascii_fonts

    @classmethod
    def get_gradients(cls) -> List[Dict[str, Any]]:
        if hasattr(cls, "_gradients"):
            return cls._gradients
        url = "https://raw.githubusercontent.com/ghosh/uiGradients/master/gradients.json"
        resp = requests.get(url)
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

    @validator("colors", always=True)
    def get_colors(cls, v, values):
        gradient = values["gradient"]
        gradients = cls.get_gradients()
        colors = [g["colors"] for g in gradients if g["name"] == gradient]
        if not colors or not colors[0]:
            raise ValueError("No colors found for gradient %s", v)
        return colors[0]


class App(BaseModel):
    id: str = Field(title="ID")
    title: str
    url: str
    version: Optional[str]
    theme: Optional[Theme]
    updated: datetime = Field(default_factory=datetime.utcnow)

    def __str__(self):
        return self.id


class AppList(BaseModel):
    __root__: List[App]

    def __iter__(self):
        return iter(self.__root__)

    def __contains__(self, key: str) -> bool:
        return self.get(key) is not None

    def __getitem__(self, key):
        return self.__root__[key]

    def get(self, id: str) -> Optional[App]:
        f = list(filter(lambda v: v.id == id, self.__root__))
        return f[0] if f else None

    def replace(self, app: App):
        current_app = self.get(app.id)
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

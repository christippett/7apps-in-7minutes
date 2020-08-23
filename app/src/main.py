import dataclasses
import json
import os
import random
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from flask import Flask, jsonify, render_template, request
from flask_cors import cross_origin
from pyfiglet import FigletFont
from pyfiglet import figlet_format as fmt

with open("theme-options.json", "r") as f:
    THEME_OPTIONS = json.load(f)


def get_random(options):
    return random.choices(options, k=1)[0]


@dataclass
class Theme:
    font: Optional[str] = os.getenv("FONT")
    ascii_font: Optional[str] = os.getenv("ASCII_FONT")
    gradient: Optional[str] = os.getenv("GRADIENT")

    def __post_init__(self):
        # Silently replace any unavailable theme properties with something
        # random instead of raising an exception
        if not self.font:
            self.font = self.get_random_font()
        if self.ascii_font not in FigletFont.getFonts():
            self.ascii_font = self.get_random_ascii_font()
        if not self.gradient or len(self.colors) == 0:
            self.gradient = self.get_random_gradient()

    @property
    def colors(self) -> List[str]:
        gradient = [g for g in THEME_OPTIONS["gradients"] if g["name"] == self.gradient]
        return gradient[0]["colors"] if gradient else []

    def get_random_font(self):
        return get_random(THEME_OPTIONS["fonts"])

    def get_random_ascii_font(self):
        fonts = FigletFont.getFonts()
        fitted = [f for f in fonts if len(fmt("7Apps", f).split("\n")) <= 15]
        return get_random(fitted)

    def get_random_gradient(self):
        return get_random(THEME_OPTIONS["gradients"])["name"]


@dataclass
class App:
    id: str
    theme: Theme
    title: Optional[str] = "7-Apps in 7-Minutes"
    version: Optional[str] = os.getenv("VERSION", "unknown")
    updated: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    @property
    def header(self) -> str:
        return fmt("7Apps", font=self.theme.ascii_font)

    @classmethod
    def from_env(cls, **kwargs):
        if os.getenv("GAE_ENV") == "standard":
            id, title = "standard", "App Engine: Standard"
        elif os.getenv("GAE_SERVICE") == "flexible":
            id, title = "flex", "App Engine: Flexible"
        elif "FUNCTION_TARGET" in os.environ:
            id, title = "function", "Cloud Function"
        elif "K_SERVICE" in os.environ and any("ANTHOS" in v for v in os.environ):
            id, title = "run-anthos", "Cloud Run: Anthos"
        elif "K_SERVICE" in os.environ:
            id, title = "run", "Cloud Run"
        elif any(v.startswith("GKE_APP") for v in os.environ):
            id, title = "kubernetes", "Kubernetes"
        elif "GCE_APP" in os.environ:
            id, title = "compute-engine", "Compute Engine"
        else:
            title, _, _ = request.host.rpartition(":")
            id = title.lower()
        return cls(id=id, title=title.title(), **kwargs)


app = Flask("7apps")
theme = Theme()


@app.route("/")
@cross_origin(send_wildcard=True)
def main(*args, **kwargs):
    app_info = App.from_env(theme=theme)

    # Return machine-readable app info (used by dashboard)
    if request.headers.get("Accept") == "application/json":
        return jsonify(dataclasses.asdict(app_info))

    return render_template("index.html", app=app_info)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

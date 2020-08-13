import dataclasses
import json
import os
import random
from dataclasses import dataclass
from typing import List, Optional

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import cross_origin
from pyfiglet import Figlet

load_dotenv(dotenv_path="theme.env", verbose=True)

VERSION = os.getenv("VERSION") or os.getenv("GAE_VERSION")
FONT = os.getenv("FONT")
ASCII_FONT = os.getenv("ASCII_FONT")
GRADIENT = os.getenv("GRADIENT")


@dataclass
class AppTheme:
    font: Optional[str] = None
    ascii_font: Optional[str] = None
    gradient: Optional[str] = None
    colors: List[str] = dataclasses.field(init=False)

    def __post_init__(self):
        with open("theme.json", "r") as f:
            theme = json.load(f)
        self.gradients = {i["name"]: i["colors"] for i in theme["gradients"]}
        if not self.gradient:
            self.gradient = random.choice(list(self.gradients.keys()))
        if not self.font:
            self.font = random.choice(theme["fonts"])
        if not self.ascii_font:
            self.ascii_font = random.choice(theme["ascii_fonts"])
        self.colors = self.gradients[self.gradient]


@dataclass
class App:
    title: str
    version: Optional[str]
    theme: AppTheme

    @property
    def header(self) -> str:
        return Figlet(font=self.theme.ascii_font).renderText("7Apps")


# Set title based on inferred runtime environment
if os.getenv("GAE_ENV") == "standard":
    title = "App Engine: Standard"
elif os.getenv("GAE_SERVICE") == "flexible":
    title = "App Engine: Flexible"
elif "FUNCTION_TARGET" in os.environ:
    title = "Cloud Function"
elif "K_SERVICE" in os.environ and any("ANTHOS" in v for v in os.environ):
    title = "Cloud Run: Anthos"
elif "K_SERVICE" in os.environ:
    title = "Cloud Run: Managed"
elif any(v.startswith("GKE_APP") for v in os.environ):
    title = "Kubernetes Engine"
elif "GCE_APP" in os.environ:
    title = "Compute Engine"
else:
    title = "Demo"

app = Flask("7apps")
theme = AppTheme(font=FONT, ascii_font=ASCII_FONT, gradient=GRADIENT)


@app.route("/")
@cross_origin(send_wildcard=True)
def main(*args, **kwargs):
    app_info = App(title=title, version=VERSION, theme=theme)

    # Override theme properties from request parameters
    if request.args and all([a in AppTheme.__dataclass_fields__ for a in request.args]):
        app_info.theme = AppTheme(**request.args)
        app_info.version = None

    # Return machine-readable app info (used by dashboard)
    if request.headers.get("Accept") == "application/json":
        return jsonify(dataclasses.asdict(app_info))

    return render_template("index.html", app=app_info)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

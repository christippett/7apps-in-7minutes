import dataclasses
import json
import os
import random
from dataclasses import dataclass
from typing import List, Optional

from colour import Color
from flask import Flask, jsonify, make_response, render_template, request
from flask_cors import cross_origin
from pyfiglet import Figlet

VERSION = os.getenv("VERSION")
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
        self.gradients = {
            g["name"]: g["colors"]
            for g in theme["gradients"]
            if self.is_vibrant(list(map(Color, g["colors"])))
        }
        if not self.gradient:
            self.gradient = random.choice(list(self.gradients.keys()))
        if not self.font:
            self.font = random.choice(theme["fonts"])
        if not self.ascii_font:
            self.ascii_font = random.choice(theme["ascii_fonts"])
        self.colors = self.gradients[self.gradient]

    def is_vibrant(self, colors: List[Color]):
        return (
            min([c.get_saturation() for c in colors]) > 0.8
            and min([c.get_luminance() for c in colors]) < 0.5
        )


@dataclass
class App:
    title: str
    version: Optional[str]
    theme: AppTheme

    @property
    def header(self) -> str:
        fmt = Figlet(font=self.theme.ascii_font, direction="left-to-right")
        return fmt.renderText("7Apps")


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
    title = "Cloud Run"
elif any(v.startswith("GKE_APP") for v in os.environ):
    title = "Kubernetes"
elif "GCE_APP" in os.environ:
    title = "Compute Engine"
else:
    title = "Demo"

app = Flask("7apps")
theme = AppTheme(font=FONT, ascii_font=ASCII_FONT, gradient=GRADIENT)


@app.route("/")
@cross_origin(send_wildcard=True)
def main(*args, **kwargs):
    app_data = App(title=title, version=VERSION, theme=theme)

    # Override theme properties from request parameters
    if request.args and all([a in AppTheme.__dataclass_fields__ for a in request.args]):
        app_data.theme = AppTheme(**request.args)
        app_data.title = "Preview"
        app_data.version = None

    # Return machine-readable app info (used by dashboard)
    if request.headers.get("Accept") == "application/json":
        return jsonify(dataclasses.asdict(app_data))

    resp = make_response(render_template("index.html", app=app_data))
    resp.headers.set("X-Frame-Options", "SAMEORIGIN")
    return resp


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

import json
import os
import random
from dataclasses import dataclass
from typing import Optional

from flask import Flask, jsonify, render_template, request
from flask_cors import cross_origin
from pyfiglet import Figlet


@dataclass
class AppConfig:
    font: str = "Staatliches"
    ascii_font: str = "slant"
    theme: Optional[str] = None

    def __post_init__(self):
        with open("gradients.json", "r") as f:
            self.gradients = {i["name"]: i["colors"] for i in json.load(f)}
        self.random_theme = random.choice(list(self.gradients.keys()))

    @property
    def title(self):
        if os.getenv("GAE_ENV") == "standard":
            return "App Engine: Standard"
        elif os.getenv("GAE_SERVICE") == "flexible":
            return "App Engine: Flexible"
        elif "K_SERVICE" in os.environ.keys() and any(
            "ANTHOS" in v for v in os.environ.keys()
        ):
            return "Cloud Run: Anthos"
        elif "K_SERVICE" in os.environ.keys():
            return "Cloud Run: Managed"
        elif any(v.startswith("GKE_APP") for v in os.environ.keys()):
            return "Kubernetes Engine"
        elif "GCE_APP" in os.environ.keys():
            return "Compute Engine"
        else:
            host = request.headers.get("Host", "7apps")
            title, _, _ = host.partition(":")
            return title

    @property
    def version(self) -> Optional[str]:
        version = os.getenv("VERSION")
        if os.path.exists(".version") and version is None:
            with open(".version", "r") as fp:
                version = fp.read().strip()
        return version

    @property
    def header(self) -> str:
        return Figlet(font=self.ascii_font).renderText("7Apps")

    @property
    def colors(self):
        return self.gradients[self.theme or self.random_theme]


app = Flask("7apps")
app_config = AppConfig()


@app.route("/")
@cross_origin(send_wildcard=True)
def main():
    if request.headers.get("Accept") == "application/json":
        return jsonify(**dataclass.asdict(app_config))
    return render_template("index.html", app=app_config)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

import logging
import os
import time

import gevent
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from flask_sockets import Sockets
from requests.exceptions import HTTPError

from utils import CloudBuildLogHandler, get_active_builds, trigger_build

load_dotenv()

SOURCES = {
    "App Engine: Standard": os.getenv("APPENGINE_STANDARD_URL"),
    "App Engine: Flexible": os.getenv("APPENGINE_FLEXIBLE_URL"),
    "Cloud Run": os.getenv("CLOUD_RUN_URL"),
    "Cloud Run: Anthos": os.getenv("CLOUD_RUN_ANTHOS_URL"),
    "Compute Engine": os.getenv("COMPUTE_ENGINE_URL"),
    "Google Kubernetes Engine": os.getenv("KUBERNETES_ENGINE_URL"),
    "Cloud Functions": os.getenv("CLOUD_FUNCTIONS_URL"),
    "Localhost": "http://localhost:8080/",
}

app = Flask(__name__)
app.debug = True
CORS(app, origins=[os.environ.get("DOMAIN", "*"), "*"])
sockets = Sockets(app)

log_handler = CloudBuildLogHandler()
log_handler.start()


@app.route("/", methods=["GET"])
def index():
    logging.warning(log_handler.build_logs)
    return render_template(
        "index.html",
        iframes=SOURCES,
        unix_timestamp=int(time.time()),
        build_logs=log_handler.build_logs,
    )


@app.route("/build", methods=["POST"])
def build():
    data = request.get_json(silent=True)
    try:
        if not data:
            raise ValueError

        substitutions = {
            "_GRADIENT_NAME": data["variables"].get("gradient_name"),
            "_ASCII_FONT": data["variables"].get("ascii_font"),
            "_TITLE_FONT": data["variables"].get("title_font"),
        }

        active_builds = get_active_builds()
        if len(active_builds) > 0:
            return {"error": "Build already in progress"}, 503

        build_id = trigger_build(substitutions)
        return jsonify(id=build_id)

    except (KeyError, ValueError):
        return {"error": "Invalid request parameters"}, 400
    except HTTPError:
        return {"error": "Unable to trigger build"}, 502


@sockets.route("/logs")
def chat_socket(ws):
    log_handler.register(ws)
    while not ws.closed:
        gevent.sleep(0.1)


if __name__ == "__main__":
    from gevent import pywsgi
    from geventwebsocket.handler import WebSocketHandler

    server = pywsgi.WSGIServer(("", 5000), app, handler_class=WebSocketHandler)
    server.serve_forever()

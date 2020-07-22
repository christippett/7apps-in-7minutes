import os
import time

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from flask_socketio import SocketIO
from requests.exceptions import HTTPError

from utils import CloudBuildLogHandler, get_active_builds, trigger_build

load_dotenv()

PORT = int(os.getenv("FLASK_PORT", 9000))
DEBUG = os.getenv("FLASK_DEBUG", False) == "True"
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
CORS(app, origins=[os.environ.get("DOMAIN", "*"), "*"])
socketio = SocketIO(app)

log_handler = CloudBuildLogHandler(socketio)
log_handler.subscribe()


@app.route("/", methods=["GET"])
def index():
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


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=PORT, debug=DEBUG)

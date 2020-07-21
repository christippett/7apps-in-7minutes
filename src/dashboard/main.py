import os
import time

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from flask_sockets import Sockets
from google.cloud import pubsub_v1
from google.cloud.pubsub_v1.types import PubsubMessage
from requests.exceptions import HTTPError

from utils import format_log_message, get_active_builds, trigger_build

load_dotenv()

CLOUD_BUILD_LOG_SUBSCRIPTION_ID = os.getenv("CLOUD_BUILD_LOG_SUBSCRIPTION_ID")
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
sockets = Sockets(app)
CORS(app, origins=[os.environ.get("DOMAIN", "*")])


@app.route("/", methods=["GET"])
def index():
    return render_template(
        "index.html", iframes=SOURCES, unix_timestamp=int(time.time())
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
    logs = []

    def callback(message: PubsubMessage):
        log = format_log_message(message.data)
        logs.append(log)
        message.ack()  # Asynchronously acknowledge the message.

    subscriber = pubsub_v1.SubscriberClient()
    future = subscriber.subscribe(CLOUD_BUILD_LOG_SUBSCRIPTION_ID, callback)

    while not ws.closed:
        message = ws.receive()
        if message is None:  # message is "None" if the client has closed.
            continue
        # Send the message to all clients connected to this webserver
        # process. (To support multiple processes or instances, an
        # extra-instance storage or messaging system would be required.)
        clients = ws.handler.server.clients.values()
        for client in clients:
            client.ws.send(message)
    future.cancel()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8081, debug=True)

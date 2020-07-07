import os

from dotenv import load_dotenv
from flask import Flask, render_template

load_dotenv()

app = Flask(__name__)

SOURCES = {
    "Localhost": "http://localhost:8080/",
    "Cloud Functions": os.getenv("CLOUD_FUNCTIONS_URL"),
    "App Engine: Standard": os.getenv("APPENGINE_STANDARD_URL"),
    "App Engine: Flexible": os.getenv("APPENGINE_FLEXIBLE_URL"),
    "Cloud Run": os.getenv("CLOUD_RUN_URL"),
    "Cloud Run: Anthos": os.getenv("CLOUD_RUN_ANTHOS_URL"),
    "Compute Engine": os.getenv("COMPUTE_ENGINE_URL"),
    "Google Kubernetes Engine": os.getenv("KUBERNETES_ENGINE_URL"),
}


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html", iframes=SOURCES)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8081, debug=True)

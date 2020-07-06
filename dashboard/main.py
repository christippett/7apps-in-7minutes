import os
from flask import Flask, render_template

app = Flask(__name__)

SOURCES = [
    "http://localhost:8080/",
    os.environ.get("COMPUTE_ENGINE_DOMAIN"),
    os.environ.get("APPENGINE_STANDARD_DOMAIN"),
    os.environ.get("APPENGINE_FLEXIBLE_DOMAIN"),
    os.environ.get("CLOUD_FUNCTIONS_DOMAIN"),
    os.environ.get("CLOUD_RUN_DOMAIN"),
    os.environ.get("CLOUD_RUN_ANTHOS_DOMAIN"),
    os.environ.get("KUBERNETES_ENGINE_DOMAIN"),
]


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html", iframes=SOURCES)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8081, debug=True)

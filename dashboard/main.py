import os


from flask import Flask, render_template

app = Flask(__name__)

SOURCES = [
    "http://localhost:8080/",
    os.environ.get("COMPUTE_ENGINE_URL"),
    os.environ.get("APPENGINE_STANDARD_URL"),
    os.environ.get("APPENGINE_FLEXIBLE_URL"),
    os.environ.get("CLOUD_FUNCTIONS_URL"),
    os.environ.get("CLOUD_RUN_URL"),
    os.environ.get("CLOUD_RUN_ANTHOS_URL"),
    os.environ.get("KUBERNETES_ENGINE_URL"),
]


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html", iframes=SOURCES)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8081, debug=True)

from flask import Flask, render_template, request

app = Flask(__name__)

SOURCES = [
    "http://localhost:8080/",
    "https://function.7apps.servian.fun/",
    "https://appengine-standard.7apps.servian.fun/",
    "https://appengine-flexible.7apps.servian.fun/",
    "https://run.7apps.servian.fun/",
    "https://run-anthos.7apps.servian.fun/",
    "https://gke.7apps.servian.fun/",
    "https://compute.7apps.servian.fun/",
]


@app.route("/", methods=["GET"])
def index():
    name = request.args.get("name", "world")
    return render_template("monitor.html", iframes=SOURCES, name=name)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8081, debug=True)

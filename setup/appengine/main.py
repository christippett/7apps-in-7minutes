from flask import Flask, render_template, request

app = Flask(__name__)

SOURCES = [
    "http://localhost:8080/",
    "https://us-central1-servian-app-demo.cloudfunctions.net/demo-function/",
    "https://gae-standard.servian.fun/",
    "https://gae-flexible.servian.fun/",
    "https://run.servian.fun/",
    "https://run-gke.servian.fun/",
    "https://gke.servian.fun/",
    "http://gce.servian.fun:8080/",
]


@app.route("/", methods=["GET"])
def index():
    name = request.args.get("name", "world")
    return render_template("monitor.html", iframes=SOURCES, name=name)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8081, debug=True)

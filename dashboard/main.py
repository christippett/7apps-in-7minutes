from flask import Flask, render_template

app = Flask(__name__, template_folder="assets")

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
    return render_template("index.html", iframes=SOURCES)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8081, debug=True)

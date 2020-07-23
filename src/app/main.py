import os

from common import ascii_font, background_gradient, page_font
from flask import Flask, jsonify, render_template, request
from flask_cors import cross_origin
from pyfiglet import Figlet

# TODO: get gradient programmatically from https://raw.githubusercontent.com/ghosh/uiGradients/master/gradients.json

APP_TITLE = os.environ.get("APP_TITLE", "Localhost")
COMMIT_SHA = os.getenv("COMMIT_SHA", "Unknown").strip()

app = Flask("7apps")

fmt = Figlet(font=ascii_font)


@app.route("/")
@cross_origin(send_wildcard=True)
def main(*args, **kwargs):
    # accomodate requests from the 7apps dashboard
    accept_language = request.headers.get("Accept-Language")
    if accept_language == "application/json":
        return jsonify(commit_sha=COMMIT_SHA)

    ascii_header = fmt.renderText("7Apps")
    return render_template(
        "index.html",
        host=request.base_url.replace("http://", "https://"),
        title=APP_TITLE,
        ascii_header=ascii_header,
        ascii_font=ascii_font,
        page_font=page_font,
        background_gradient=background_gradient,
        commit_sha=COMMIT_SHA,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

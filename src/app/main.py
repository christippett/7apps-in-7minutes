import os
from random import randrange

from flask import Flask, jsonify, render_template, request
from flask_cors import cross_origin
from pyfiglet import Figlet

# TODO: get gradient programmatically from https://raw.githubusercontent.com/ghosh/uiGradients/master/gradients.json

APP_TITLE = os.environ.get("APP_TITLE", "Localhost")
BG_CLASS = randrange(0, 10)
FONT_CLASS = randrange(0, 6)
ASCII_OPTIONS = [
    "big",
    "stop",
    "rounded",
    "cricket",
    "contrast",
    "banner",
    "larry3d",
    "ogre",
    "speed",
    "smkeyboard",
    "graffiti",
    "fuzzy",
    "lean",
    "moscow",
    "pawp",
    "rectangles",
    "serifcap",
]
ASCII_FONT = ASCII_OPTIONS[randrange(0, len(ASCII_OPTIONS) - 1)]

try:
    COMMIT_SHA = open("commit_sha.txt", "r").read()
except FileNotFoundError:
    import git

    repo = git.Repo(search_parent_directories=True)
    COMMIT_SHA = repo.head.object.hexsha[:7]

app = Flask("7apps")

fmt = Figlet(font=ASCII_FONT)


@app.route("/")
@cross_origin(send_wildcard=True)
def main(*args, **kwargs):
    # accomodate requests from the 7apps dashboard
    accept_language = request.headers.get("Accept-Language")
    if accept_language == "application/json":
        return jsonify(commit_sha=COMMIT_SHA)

    #
    ascii_header = fmt.renderText("7Apps")
    return render_template(
        "index.html",
        host=request.base_url.replace("http://", "https://"),
        service_name=APP_TITLE,
        ascii_header=ascii_header,
        ascii_font=ASCII_FONT,
        commit_sha=COMMIT_SHA.strip(),
        bg_class=BG_CLASS,
        font_class=FONT_CLASS,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

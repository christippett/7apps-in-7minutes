import os
from random import randrange

from flask import Flask, Request, jsonify, render_template, request
from flask_cors import CORS
from pyfiglet import Figlet

ENVIRONMENT = os.environ.get("ENVIRONMENT", "Localhost")
RANDOM_INT = randrange(1, 11)
ASCII_OPTIONS = [
    "big",
    "stop",
    "rounded",
    "puffy",
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
CORS(app)

fmt = Figlet(font=ASCII_FONT)


def main(req: Request):
    accept_language = req.headers.get("Accept-Language")
    if accept_language == "application/json":
        resp = jsonify(commit_sha=COMMIT_SHA)
        resp.headers.add_header("Access-Control-Allow-Origin", "*")
        return resp
    title = req.args.get("title", "7Apps")
    ascii_title = fmt.renderText(title)
    return render_template(
        "index.html",
        ascii=ascii_title,
        ascii_font=ASCII_FONT,
        commit_sha=COMMIT_SHA,
        host=req.base_url.replace("http://", "https://"),
        bg_number=RANDOM_INT,
        style_number=(RANDOM_INT % 4),
        env=ENVIRONMENT,
    )


@app.route("/")
def index():
    return main(request)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

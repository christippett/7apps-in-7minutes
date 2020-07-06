import os
from random import randrange

from flask import Flask, Request, render_template, request
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
    "cybermedium",
    "eftifont",
    "fuzzy",
    "lean",
    "moscow",
    "pawp",
    "rectangles",
    "serifcap",
]

try:
    COMMIT_SHA = open("commit_sha.txt", "r").read()
except FileNotFoundError:
    COMMIT_SHA = "???"

app = Flask("7apps")
fmt = Figlet(font=ASCII_OPTIONS[randrange(0, len(ASCII_OPTIONS) - 1)])


def main(req: Request):
    title = req.args.get("title", "7Apps")
    ascii_title = fmt.renderText(title)
    return render_template(
        "index.html",
        ascii=ascii_title,
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

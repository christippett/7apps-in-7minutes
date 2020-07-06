import os
from random import randrange

from flask import Flask, Request, render_template, request
from pyfiglet import Figlet

ENVIRONMENT = os.environ.get("ENVIRONMENT", "Localhost")
RANDOM_INT = randrange(1, 10)

app = Flask("7apps")
fmt = Figlet(font="big")


def main(req: Request):
    title = req.args.get("title", "7Apps")
    ascii_title = fmt.renderText(title)
    return render_template(
        "index.html",
        ascii=ascii_title,
        host=req.base_url,
        bg_number=RANDOM_INT,
        style_number=(RANDOM_INT % 3),
        env=ENVIRONMENT,
    )


@app.route("/")
def index():
    return main(request)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

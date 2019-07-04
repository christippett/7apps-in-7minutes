import os

from flask import Flask, render_template, request, Request
from pyfiglet import Figlet

ENVIRONMENT = os.environ.get("ENVIRONMENT", "local")

app = Flask("7apps")


def greeting(req: Request):
    font = req.args.get("font", "slant")
    name = req.args.get("name", "world")
    greeting = f"Hello {name}!"
    fmt = Figlet(font=font)
    ascii = fmt.renderText(greeting)
    return render_template(
        "greeting.html", greeting=greeting, ascii=ascii, env=ENVIRONMENT
    )


@app.route("/", methods=["GET"])
def index():
    return greeting(request)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

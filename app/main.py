import os

from flask import Flask, Request, render_template, request
from pyfiglet import Figlet

ENVIRONMENT = os.environ.get("ENVIRONMENT", "local")  # where the app is running

app = Flask("7apps")
fmt = Figlet(font="slant")  # render our greeting in a fancy ascii font


def greeting(req: Request):
    name = req.args.get("name", "world")
    greeting = f"Hello {name}!"
    ascii_greeting = fmt.renderText(greeting)
    return render_template(
        "greeting.html", greeting=greeting, ascii=ascii_greeting, env=ENVIRONMENT
    )


@app.route("/")
def index(path):
    return greeting(request)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

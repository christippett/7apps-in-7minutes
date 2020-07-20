from random import randrange

import requests

GRADIENTS_SOURCE_URL = (
    "https://raw.githubusercontent.com/ghosh/uiGradients/master/gradients.json"
)

GRADIENT_OPTIONS = requests.get(GRADIENTS_SOURCE_URL).json()

FONT_OPTIONS = [
    "Bungee",
    "Fredoka One",
    "Pacifico",
    "Permanent Marker",
    "Monoton",
    "BioRhyme",
    "Creepster",
]

ASCII_FONT_OPTIONS = [
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

page_font = FONT_OPTIONS[randrange(0, len(FONT_OPTIONS) - 1)]
ascii_font = ASCII_FONT_OPTIONS[randrange(0, len(ASCII_FONT_OPTIONS) - 1)]
background_gradient = GRADIENT_OPTIONS[randrange(0, len(GRADIENT_OPTIONS) - 1)]
background_gradient.update({"angle": randrange(1, 360)})

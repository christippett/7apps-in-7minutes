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
    "Chewy",
    "Staatliches",
    "Handlee",
    "Carter One",
    "Luckiest Guy",
    "Rock Salt",
    "Yeseva One",
    "Black Ops One",
    "Jura",
    "Rubik Mono One",
    "Cinzel Decorative",
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
    "pawp",
    "rectangles",
    "serifcap",
    "roman",
    "maxfour",
    "graceful",
    "usaflag",
    "thick",
    "drpepper",
    "ticksslant",
    "slant",
    "bubble",
    "lockergnome",
    "relief2",
    "o8",
    "tubular",
    "rev",
    "utopiab",
    "starwars",
    "basic",
    "rozzo",
    "jazmine",
    "cosmike",
    "contrast",
    "letters",
]

page_font = FONT_OPTIONS[randrange(0, len(FONT_OPTIONS) - 1)]
ascii_font = ASCII_FONT_OPTIONS[randrange(0, len(ASCII_FONT_OPTIONS) - 1)]
background_gradient = GRADIENT_OPTIONS[randrange(0, len(GRADIENT_OPTIONS) - 1)]
background_gradient.update({"angle": randrange(1, 360)})

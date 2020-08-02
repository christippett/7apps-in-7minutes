from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel
from pydantic.fields import Field


class AppTheme(BaseModel):
    """ Application configuration that mostly impacts its visual style """

    gradient: Optional[str]
    ascii_font: Optional[str]
    font: Optional[str]
    colors: Optional[List[str]]

    def get_build_substitutions(self):
        substitutions = {
            "_GRADIENT": self.gradient,
            "_FONT": self.font,
            "_ASCII_FONT": self.ascii_font,
        }
        return {k: v for k, v in substitutions.items() if v is not None}


class App(BaseModel):
    name: str
    title: str
    url: str
    version: Optional[str]
    theme: Optional[AppTheme]
    updated: datetime = Field(default_factory=datetime.utcnow)

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel
from pydantic.color import Color
from pydantic.fields import Field


class AppTheme(BaseModel):
    """ Application configuration that mostly impacts its visual style """

    gradient: Optional[str]
    ascii_font: Optional[str]
    font: Optional[str]
    colors: Optional[List[Color]]

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
    version: Optional[str] = Field(alias="SHORT_SHA")
    theme: Optional[AppTheme]
    updated: datetime = Field(default_factory=datetime.utcnow)


class Message(BaseModel):
    topic: str
    data: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

    class Config:
        extra = "allow"

    def __init__(self, **data: Any):
        super().__init__(**data)
        self.metadata.update({"timestamp": datetime.utcnow()})

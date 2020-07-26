from typing import Optional

from pydantic import BaseModel


class AppConfig(BaseModel):
    """ Application configuration that mostly impacts its visual style """

    gradient: Optional[str] = None
    ascii_font: Optional[str] = None
    font: Optional[str] = None

    def get_build_substitutions(self):
        substitutions = {
            "_GRADIENT": self.gradient,
            "_FONT": self.font,
            "_ASCII_FONT": self.ascii_font,
        }
        return {k: v for k, v in substitutions.items() if v is not None}


class DeployJob(BaseModel):
    """ Cloud Build Job ID """

    id: str


class BuildRef(BaseModel):
    """ Cloud Build reference """

    projectId: str
    id: str

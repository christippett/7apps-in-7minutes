from typing import Optional

from pydantic import BaseModel


class AppConfig(BaseModel):
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
    id: str

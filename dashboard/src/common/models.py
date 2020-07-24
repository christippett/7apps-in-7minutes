from typing import Optional

from pydantic import BaseModel


class Style(BaseModel):
    gradient_name: Optional[str] = None
    ascii_font: Optional[str] = None
    title_font: Optional[str] = None


class DeploymentConfig(BaseModel):
    style: Style


class DeployJob(BaseModel):
    id: int

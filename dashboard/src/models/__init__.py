from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, validator
from pydantic.fields import Field


class Message(BaseModel):
    topic: str
    data: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

    class Config:
        extra = "allow"

    @validator("metadata", always=True)
    def record_timestamp(cls, v):
        v["timestamp"] = datetime.utcnow()
        return v


class DeploymentJob(BaseModel):
    id: str
    version: str
    create_time: datetime = Field(alias="createTime")

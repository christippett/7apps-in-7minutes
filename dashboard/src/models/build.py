import re
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

import yaml
from pydantic import BaseModel, Field, validator


class Artifacts(BaseModel):
    images: List[str]


class Options(BaseModel):
    substitutionOption: str
    logStreamingOption: str
    logging: str
    env: List[str]
    dynamicSubstitutions: bool


class StorageSource(BaseModel):
    bucket: str
    object_: str = Field(alias="object")


class Source(BaseModel):
    storageSource: StorageSource


class ResolvedStorageSource(BaseModel):
    bucket: str
    object_: str = Field(alias="object")
    generation: str


class SourceProvenance(BaseModel):
    resolvedStorageSource: ResolvedStorageSource


class Step(BaseModel):
    id: str = Field(title="ID")
    name: str
    entrypoint: Optional[str]
    args: Optional[List[str]]
    env: Optional[List[str]]
    dir: Optional[str]
    waitFor: Optional[List[str]]


class BuildRef(BaseModel):
    """ Cloud Build reference """

    id: str = Field(title="ID")
    status: str
    source: Optional[Source]
    createTime: datetime
    steps: List[Step]
    timeout: str
    images: Optional[List[str]]
    projectId: str
    logsBucket: str
    sourceProvenance: Optional[SourceProvenance]
    buildTriggerId: Optional[str]
    options: Optional[Options]
    logUrl: str
    substitutions: Dict[str, str]
    tags: List[str]
    artifacts: Optional[Artifacts]
    queueTtl: str

    def generate_config_yaml(self) -> Optional[str]:
        config = {
            "steps": [s.dict(exclude_unset=True) for s in self.steps],
            "substitutions": self.substitutions,
        }
        return yaml.dump(config, default_flow_style=False, sort_keys=False)


class LogType(str, Enum):
    SectionHeader = "section-header"
    StepStatus = "step-status"
    Separator = "separator"


class LogSection(str, Enum):
    FetchSource = "fetchsource"
    Build = "build"
    Push = "push"
    Done = "done"
    Error = "error"
    Header = "header"
    Footer = "footer"


class LogRecord(BaseModel):
    text: str
    step: Optional[int]
    id: Optional[str] = Field(title="ID")
    section: Optional[LogSection]
    type_: Optional[LogType] = Field(alias="type")

    class Config:
        use_enum_values = True

    @validator("step", pre=True, always=True)
    def match_step(cls, v, values):
        text = values.get("text", "")
        m = re.search(r"step #(\d+)", text, flags=re.I)
        return m.group(1) if m else None

    @validator("id", pre=True, always=True)
    def match_id(cls, v, values):
        text = values.get("text", "")
        m = re.search(r"step #\d+ - \"(.+?)\"", text, flags=re.I)
        return m.group(1) if m else None

    @validator("section", pre=True, always=True)
    def match_section(cls, v, values):
        text = values.get("text", "")
        m = re.match(r"\s*(FETCHSOURCE|BUILD|PUSH|DONE|ERROR)", text)
        return m.group(1).lower() if m else v

    @validator("type_", pre=True, always=True)
    def match_type(cls, v, values):
        text = values.get("text", "")
        if re.match(r"\s*(FETCHSOURCE|BUILD|PUSH|DONE|ERROR)", text):
            return LogType.SectionHeader
        elif re.match(r"\s*(starting|finished)", text, flags=re.I):
            return LogType.StepStatus
        elif re.match(r"^[=-]+$", text):
            return LogType.Separator

    @validator("text")
    def transform_text(cls, v):
        # Remove extended ellipses
        return re.sub(r"\.{4,}", r"...", v).rstrip("\n")

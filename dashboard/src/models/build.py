from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel


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
    object: str


class Source(BaseModel):
    storageSource: StorageSource


class ResolvedStorageSource(BaseModel):
    bucket: str
    object: str
    generation: str


class SourceProvenance(BaseModel):
    resolvedStorageSource: ResolvedStorageSource


class Step(BaseModel):
    id: str
    name: str
    entrypoint: Optional[str]
    args: Optional[List[str]]
    env: Optional[List[str]]
    dir: Optional[str]
    waitFor: Optional[List[str]]


class BuildRef(BaseModel):
    """ Cloud Build reference """

    id: str
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

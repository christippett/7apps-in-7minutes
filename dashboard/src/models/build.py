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
    name: str
    args: List[str]
    id: str
    waitFor: List[str]
    dir: Optional[str] = None
    entrypoint: Optional[str] = None


class BuildRef(BaseModel):
    """ Cloud Build reference """

    id: str
    status: str
    source: Source
    createTime: datetime
    steps: List[Step]
    timeout: str
    images: List[str]
    projectId: str
    logsBucket: str
    sourceProvenance: SourceProvenance
    buildTriggerId: str
    options: Options
    logUrl: str
    substitutions: Dict[str, str]
    tags: List[str]
    artifacts: Artifacts
    queueTtl: str

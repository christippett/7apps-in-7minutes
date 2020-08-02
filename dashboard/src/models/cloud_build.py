from datetime import datetime
from typing import Dict, List, Optional, Union

from humps import camelize
from pydantic import BaseModel
from pydantic.types import UUID4


def to_camel(string):
    return camelize(string)


class CamelModel(BaseModel):
    class Config:
        alias_generator = to_camel
        allow_population_by_field_name = True


class Artifacts(CamelModel):
    images: List[str]


class Options(CamelModel):
    substitution_option: str
    log_streaming_option: str
    logging: str
    env: List[str]
    dynamic_substitutions: bool


class StorageSource(CamelModel):
    bucket: str
    object: str


class Source(CamelModel):
    storage_source: StorageSource


class ResolvedStorageSource(CamelModel):
    bucket: str
    object: str
    generation: str


class SourceProvenance(CamelModel):
    resolved_storage_source: ResolvedStorageSource


class Step(CamelModel):
    name: str
    args: List[str]
    id: str
    wait_for: List[str]
    dir: Optional[str] = None
    entrypoint: Optional[str] = None


class BuildRef(CamelModel):
    """ Cloud Build reference """

    id: UUID4
    status: str
    source: Source
    create_time: datetime
    steps: List[Step]
    timeout: str
    images: List[str]
    project_id: str
    logs_bucket: str
    source_provenance: SourceProvenance
    build_trigger_id: UUID4
    options: Options
    log_url: str
    substitutions: Dict[str, str]
    tags: List[str]
    artifacts: Artifacts
    queue_ttl: str

from typing import Any, Dict, Optional

from pydantic import BaseSettings, Field, HttpUrl

from .logging import LOGGING_CONFIG


class Settings(BaseSettings):
    debug: bool = False
    gcloud_project: Optional[str] = Field(
        env=[
            "CLOUDSDK_CORE_PROJECT",
            "GCLOUD_PROJECT",
            "GCP_PROJECT",
            "GOOGLE_CLOUD_PROJECT",
        ]
    )
    gcloud_dir: str = Field(env="CLOUDSDK_HOME")
    github_repo: str
    github_branch: str
    cloud_build_api_url: HttpUrl = Field(default="https://cloudbuild.googleapis.com/v1")
    cloud_build_trigger_id: str
    cloud_build_subscription_id: str
    logging_config: Dict[str, Any] = LOGGING_CONFIG

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

__ALL__ = [settings]

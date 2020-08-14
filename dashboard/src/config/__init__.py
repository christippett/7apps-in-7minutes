from typing import Any, Dict

import google.auth
from google.auth.credentials import Credentials
from pydantic import BaseSettings, Field, HttpUrl

from .logging import LOGGING_CONFIG


class Settings(BaseSettings):
    debug: bool = False
    gcloud_dir: str = Field(env="CLOUDSDK_HOME")
    google_project: str = Field(
        env=[
            "CLOUDSDK_CORE_PROJECT",
            "GCLOUD_PROJECT",
            "GCP_PROJECT",
            "GOOGLE_CLOUD_PROJECT",
        ]
    )
    google_credentials: Credentials
    google_api_key: str
    github_repo: str
    github_branch: str
    cloud_build_api_url: HttpUrl = Field(default="https://cloudbuild.googleapis.com/v1")
    cloud_build_trigger_id: str
    cloud_build_subscription_id: str
    logging_config: Dict[str, Any] = LOGGING_CONFIG

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def __init__(self, **data):
        credentials, project = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        super().__init__(google_credentials=credentials, google_project=project, **data)


settings = Settings()

__ALL__ = [settings]

from typing import Any, Dict

import google.auth
from google.auth.credentials import Credentials
from google.cloud import secretmanager
from pydantic import BaseSettings, Field, HttpUrl

from .logging import LOGGING_CONFIG

credentials, project = google.auth.default(
    scopes=["https://www.googleapis.com/auth/cloud-platform"],
)
secrets_client = secretmanager.SecretManagerServiceClient()


def get_secret_value(secret, version="latest"):
    path = secrets_client.secret_path(project, secret)
    response = secrets_client.access_secret_version(f"{path}/versions/{version}")
    return response.payload.data


class Settings(BaseSettings):
    debug: bool = False
    gcloud_dir: str = Field(env="CLOUDSDK_HOME")
    google_project: str = Field(
        default=project,
        env=[
            "CLOUDSDK_CORE_PROJECT",
            "GCLOUD_PROJECT",
            "GCP_PROJECT",
            "GOOGLE_CLOUD_PROJECT",
        ]
    )
    google_credentials: Credentials = credentials
    google_fonts_api_key: str = Field(default=get_secret_value("GOOGLE_FONTS_API_KEY"))
    github_repo: str
    github_branch: str
    cloud_build_api_url: HttpUrl = Field(default="https://cloudbuild.googleapis.com/v1")
    cloud_build_trigger_id: str = Field(default=get_secret_value("CLOUD_BUILD_TRIGGER_ID"))
    logging_config: Dict[str, Any] = LOGGING_CONFIG


settings = Settings(github_repo="7apps-google-cloud", github_branch="demo")

__ALL__ = [settings]

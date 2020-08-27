from pathlib import Path
from typing import Optional

import google.auth
from google.cloud import error_reporting, secretmanager, storage
from pydantic import BaseSettings, Field, HttpUrl, validator

ROOT_DIR = root_dir = Path(__file__).parent.parent

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "icon": {
            "class": "common.logging.ColourFormatter",
            "format": "%(icon)2s %(message)s %(name)s",
        }
    },
    "filters": {"icon": {"()": "common.logging.IconFilter"}},
    "handlers": {
        "default": {
            "level": "DEBUG",
            "formatter": "icon",
            "filters": ["icon"],
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
        }
    },
    "loggers": {
        "dashboard": {"handlers": ["default"], "level": "DEBUG", "propagate": False}
    },
}


class GoogleClientManager:
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    def __init__(self):
        self.credentials, self.project = google.auth.default(scopes=self.scopes)
        self.storage = storage.Client()
        self.secrets = secretmanager.SecretManagerServiceClient()
        self.error = error_reporting.Client()

    def get_secret(self, secret, version="latest"):
        path = self.secrets.secret_path(self.project, secret)
        secret_name = f"{path}/versions/{version}"
        response = self.secrets.access_secret_version(secret_name)
        return response.payload.data


class Settings(BaseSettings):
    debug: bool = False
    root_dir = ROOT_DIR
    static_dir = ROOT_DIR.joinpath("static")
    templates_dir = ROOT_DIR.joinpath("templates")
    github_repo: str = "7apps-google-cloud"
    github_branch: str = "demo"
    gcp: GoogleClientManager = Field(default_factory=GoogleClientManager)
    google_fonts_api_key: Optional[str]
    cloud_build_api_url: HttpUrl = Field(default="https://cloudbuild.googleapis.com/v1")
    cloud_build_trigger_id: Optional[str]
    enable_stackdriver_logging: bool = False

    class Config:
        case_sensitive = False

    @validator("google_fonts_api_key", pre=True, always=True)
    def default_google_fonts_api_key(cls, v, values):
        gcp = values.get("gcp")
        return v or gcp.get_secret("GOOGLE_FONTS_API_KEY")

    @validator("cloud_build_trigger_id", pre=True, always=True)
    def default_cloud_build_trigger_id(cls, v, values):
        gcp = values.get("gcp")
        return v or gcp.get_secret("CLOUD_BUILD_TRIGGER_ID")


settings = Settings()

__ALL__ = [settings, LOGGING_CONFIG]

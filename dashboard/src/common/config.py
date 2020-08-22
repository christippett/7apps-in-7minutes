import google.auth
from google.cloud import secretmanager
from pydantic import BaseSettings, Field, HttpUrl

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
    google_project = project
    google_credentials = credentials
    google_fonts_api_key: str = Field(default=get_secret_value("GOOGLE_FONTS_API_KEY"))
    github_repo: str
    github_branch: str
    cloud_build_api_url: HttpUrl = Field(default="https://cloudbuild.googleapis.com/v1")
    cloud_build_trigger_id: str = Field(
        default=get_secret_value("CLOUD_BUILD_TRIGGER_ID")
    )
    enable_stackdriver_logging: bool = False

    class Config:
        case_sensitive = False


settings = Settings()

__ALL__ = [settings, LOGGING_CONFIG]

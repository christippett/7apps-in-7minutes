import os

from dotenv import load_dotenv

load_dotenv()

CLOUDSDK_HOME = os.getenv("CLOUDSDK_HOME", "/google-cloud-sdk")

GITHUB_REPO = os.getenv("GITHUB_REPO")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH")
CLOUD_BUILD_API = "https://cloudbuild.googleapis.com/v1"
CLOUD_BUILD_TRIGGER_ID = os.getenv("CLOUD_BUILD_TRIGGER_ID")
CLOUD_BUILD_SUBSCRIPTION_ID = os.getenv("CLOUD_BUILD_SUBSCRIPTION_ID")

CENSOR_SYMBOL = "▇"

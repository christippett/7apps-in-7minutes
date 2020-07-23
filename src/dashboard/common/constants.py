import os

from dotenv import load_dotenv

load_dotenv()

SOURCES = {
    "App Engine: Standard": os.getenv("APPENGINE_STANDARD_URL"),
    "App Engine: Flexible": os.getenv("APPENGINE_FLEXIBLE_URL"),
    "Cloud Run": os.getenv("CLOUD_RUN_URL"),
    "Cloud Run: Anthos": os.getenv("CLOUD_RUN_ANTHOS_URL"),
    "Compute Engine": os.getenv("COMPUTE_ENGINE_URL"),
    "Google Kubernetes Engine": os.getenv("KUBERNETES_ENGINE_URL"),
    "Cloud Functions": os.getenv("CLOUD_FUNCTIONS_URL"),
    "Localhost": "http://localhost:8080/",
}

GITHUB_REPO = os.getenv("GITHUB_REPO")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH")
CLOUD_BUILD_API = "https://cloudbuild.googleapis.com/v1"
CLOUD_BUILD_TRIGGER_ID = os.getenv("CLOUD_BUILD_TRIGGER_ID")
CLOUD_BUILD_SUBSCRIPTION_ID = os.getenv("CLOUD_BUILD_SUBSCRIPTION_ID")

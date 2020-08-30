import enum
import logging
from typing import List

from googleapiclient import discovery

from common.config import settings
from common.utils import execute_api_request

logger = logging.getLogger("dashboard." + __name__)


class ServingStatus(enum.Enum):
    Serving = "SERVING"
    Stopped = "STOPPED"


class AppEngineService:
    def __init__(self):
        self.client = discovery.build("appengine", "v1")

    def list_versions(self, service, status: ServingStatus = None) -> List:
        req = (
            self.client.apps()
            .services()
            .versions()
            .list(appsId=settings.gcp.project, servicesId=service)
        )
        data = execute_api_request(req)
        versions = data["versions"]
        if status is not None:
            return list(filter(lambda v: v["servingStatus"] == status.value, versions))
        return versions

    def patch_version(self, service, version, **body):
        req = (
            self.client.apps()
            .services()
            .versions()
            .patch(
                appsId=settings.gcp.project,
                servicesId=service,
                versionsId=version,
                body=body,
                updateMask=",".join(body.keys()),
            )
        )
        return execute_api_request(req)

    def is_serving(self, service) -> bool:
        versions = self.list_versions(service=service)
        return any((v["servingStatus"] == "SERVING" for v in versions))

    def is_stopped(self, service) -> bool:
        return not self.is_serving(service)

    def start_service(self, service):
        versions = self.list_versions(service=service, status=ServingStatus.Stopped)
        if versions:
            version = versions[0]
            logger.info("Starting App Engine version: %s/%s", service, version)
            self.patch_version(
                service=service, version=version["id"], servingStatus="SERVING"
            )

    def stop_service(self, service):
        versions = self.list_versions(service=service, status=ServingStatus.Serving)
        for version in versions:
            logger.info("Stopping App Engine version: %s/%s", service, version)
            self.patch_version(
                service=service, version=version["id"], servingStatus="SERVING"
            )

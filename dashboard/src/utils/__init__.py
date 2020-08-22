import logging
from asyncio import Future

from google.cloud import error_reporting

from config import settings

logger = logging.getLogger("dashboard." + __name__)

error_client = error_reporting.Client()


def future_exception_handler(future: Future):
    exc = future.exception()
    if exc and settings.enable_stackdriver_logging:
        logger.error("Exception found in Future response: %s", exc, exc_info=exc)
        error_client.report(exc)

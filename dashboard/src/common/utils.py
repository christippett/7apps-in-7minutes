import logging
from asyncio import Future

from fastapi import HTTPException

import google_auth_httplib2
from googleapiclient import errors
from googleapiclient.http import build_http

from .config import settings

logger = logging.getLogger("dashboard." + __name__)


def future_exception_handler(future: Future):
    exc = future.exception()
    if exc is not None:
        logger.error("Future exception: %s", exc, exc_info=exc, icon="🔮")


def execute_api_request(request):
    http = google_auth_httplib2.AuthorizedHttp(
        settings.gcp.credentials, http=build_http()
    )
    try:
        return request.execute(http=http)
    except errors.HttpError as exc:
        logger.error(exc)
        reason = exc._get_reason()
        detail = f"Cloud Build API returned error response: {reason}"
        raise HTTPException(status_code=exc.resp.status, detail=detail)

import logging
from asyncio import Future

from fastapi import HTTPException, Request
from fastapi.security.utils import get_authorization_scheme_param
from starlette.status import HTTP_401_UNAUTHORIZED

import google_auth_httplib2
from google import auth
from google.auth.transport import requests
from google.oauth2 import id_token
from googleapiclient import errors, http

from .config import settings

logger = logging.getLogger("dashboard." + __name__)


def future_exception_handler(future: Future):
    exc = future.exception()
    if exc is not None:
        logger.error("Future exception: %s", exc, exc_info=exc, icon="🔮")


def execute_api_request(request: http.HttpRequest):
    new_http = google_auth_httplib2.AuthorizedHttp(
        settings.gcp.credentials, http=http.build_http()
    )
    try:
        return request.execute(http=new_http)
    except errors.HttpError as exc:
        logger.error(exc)
        reason = exc._get_reason()
        detail = f"Cloud Build API returned error response: {reason}"
        raise HTTPException(status_code=exc.resp.status, detail=detail)


def validate_google_identity(request: Request):
    authorization: str = request.headers.get("Authorization")
    logger.info(authorization)
    scheme, token = get_authorization_scheme_param(authorization)
    logger.info("%s %s", scheme, token)
    if not authorization or scheme.lower() != "bearer":
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED)
    try:
        return id_token.verify_token(
            id_token=token,
            request=requests.Request(),
            audience=str(request.base_url),
            certs_url="https://www.googleapis.com/oauth2/v1/certs",
        )
    except ValueError:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED)

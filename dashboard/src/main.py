import logging
import logging.config
import time

import uvicorn
from fastapi import (
    BackgroundTasks,
    FastAPI,
    HTTPException,
    Request,
    Response,
    WebSocket,
)
from fastapi.encoders import jsonable_encoder
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.websockets import WebSocketDisconnect
from google.cloud import error_reporting
from google.cloud.error_reporting import HTTPContext
from requests.exceptions import HTTPError as RequestsHTTPError
from starlette.exceptions import HTTPException as StarletteHTTPException

from common.config import LOGGING_CONFIG, settings
from common.logging import setup_stackdriver_logging
from models import DeploymentJob
from models.app import Theme
from services import AppService, Notifier

logging.config.dictConfig(LOGGING_CONFIG)
logger = logging.getLogger("dashboard.main")
if settings.enable_stackdriver_logging:
    logger.debug("Enabling Stackdriver logging")
    setup_stackdriver_logging()


app = FastAPI(
    title="7-Apps in 7-Minutes",
    description="Dashboard and API for interacting with the 7-Apps demo application.",
    debug=settings.debug,
)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

error = error_reporting.Client()

notifier = Notifier()
app_service = AppService.load_from_config("7apps.yaml", notifier=notifier)


@app.exception_handler(StarletteHTTPException)
async def unicorn_exception_handler(request: Request, exc: StarletteHTTPException):
    context = HTTPContext(
        method=request.method,
        url=str(request.url),
        user_agent=request.headers.get("User-Agent"),
        referrer=request.headers.get("Referrer"),
        remote_ip=request.client.host,
        response_status_code=500,
    )
    error.report_exception(http_context=context)
    return await http_exception_handler(request, exc)


@app.get("/")
async def index(request: Request):
    display_order = [
        "localhost",
        "compute-engine",
        "kubernetes",
        "function",
        "run",
        "run-anthos",
        "standard",
        "flex",
    ]
    props = {
        "themes": Theme.random(20),
        "apps": sorted(app_service.apps, key=lambda v: display_order.index(v.id)),
    }
    return templates.TemplateResponse(
        name="index.html",
        context={
            "request": request,
            "props": jsonable_encoder(props, exclude_none=True),
            "timestamp": int(time.time()),
        },
    )


@app.post(
    "/deploy",
    response_model=DeploymentJob,
    responses={
        200: {"description": "Deployment Job successfully created"},
        409: {
            "model": DeploymentJob,
            "description": "Deployment Job already in-progress",
        },
    },
)
async def deploy(theme: Theme, background_tasks: BackgroundTasks, response: Response):
    """
    Create new Deployment Job
    """
    try:
        response.status_code = 409 if app_service.build.get_active_builds() else 200
        version, build = await app_service.deploy(theme)
        background_tasks.add_task(app_service.start_polling_for_version, version, build)
        background_tasks.add_task(app_service.build.stream_logs, build)
    except RequestsHTTPError as e:
        logger.exception(e)
        code = e.response.status_code
        raise HTTPException(code, detail="Unable to trigger Cloud Build deployment")
    return DeploymentJob.construct(
        id=build.id, version=version, create_time=build.createTime
    )


@app.on_event("startup")
async def startup():
    # prime generator: https://stackoverflow.com/a/19892334
    await notifier.notification_generator.asend(None)
    await app_service.refresh_app_data()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await notifier.connect(websocket)
    try:
        while True:
            text = await websocket.receive_text()
            logger.debug(f"{websocket.client.host}: {text}")
            await notifier.send("echo", text=text)
            # await websocket.send_text(f"Message text was: {data}")
    except WebSocketDisconnect:
        notifier.disconnect(websocket)


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse("static/favicon.ico")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, debug=settings.debug)

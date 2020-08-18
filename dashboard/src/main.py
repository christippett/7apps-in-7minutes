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
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from requests.exceptions import HTTPError
from starlette.responses import FileResponse
from starlette.websockets import WebSocketDisconnect

from config import settings
from models import AppTheme
from services import AppService, CloudBuildService, Notifier

logging.config.dictConfig(settings.logging_config)
logger = logging.getLogger("main")

templates = Jinja2Templates(directory="templates")

app = FastAPI(debug=settings.debug)
app.mount("/static", StaticFiles(directory="static"), name="static")

notifier = Notifier()
app_service = AppService.load_from_config("apps.yaml", notifier=notifier)


@app.get("/")
async def index(request: Request):
    display_order = [
        "run",
        "run-anthos",
        "kubernetes",
        "compute-engine",
        "standard",
        "flex",
        "function",
    ]
    props = {
        "themes": AppTheme.random(20),
        "apps": sorted(app_service.apps, key=lambda v: display_order.index(v.name)),
    }
    return templates.TemplateResponse(
        name="index.html",
        context={
            "request": request,
            "props": jsonable_encoder(props),
            "debug": app.debug,
            "unix_timestamp": int(time.time()),
        },
    )


@app.post("/deploy")
async def deploy(
    theme: AppTheme, background_tasks: BackgroundTasks, response: Response
):
    """
    Trigger a Cloud Build job to deploy a new app version.
    """
    try:
        response.status_code = (
            409 if app_service.build.active_builds(refresh=True) else 200
        )
        version, build = await app_service.deploy(theme)
        background_tasks.add_task(app_service.start_monitor, version, build)
        background_tasks.add_task(app_service.build.start_log_stream, build)
    except HTTPError as e:
        logger.exception(e)
        code = e.response.status_code
        raise HTTPException(code, detail="Unable to trigger Cloud Build deployment")
    return {"id": build.id, "version": version}


@app.get("/build/{id}")
def build(id: str):
    cb = CloudBuildService()
    return cb.get_build(id)


@app.on_event("startup")
async def startup():
    # prime generator: https://stackoverflow.com/a/19892334
    await notifier.notification_generator.asend(None)
    await app_service.update_apps()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await notifier.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message text was: {data}")
    except WebSocketDisconnect:
        notifier.disconnect(websocket)


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse("static/favicon.ico")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, debug=settings.debug)

import time

from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from requests.exceptions import HTTPError
from starlette.responses import FileResponse
from starlette.websockets import WebSocketDisconnect

from common.constants import APP_LIST
from common.models import DeployJob, DeploymentConfig
from common.utils import (
    PubSubMessageBroker,
    extract_app_name_from_url,
    get_active_builds,
    trigger_build,
)

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

pubsub_broker = PubSubMessageBroker()


@app.get("/")
def index(request: Request):
    app_list = [
        {"name": extract_app_name_from_url(url), "title": title, "url": url}
        for title, url in APP_LIST.items()
    ]
    return templates.TemplateResponse(
        name="index.html",
        context={
            "request": request,
            "app_list": app_list,
            "unix_timestamp": int(time.time()),
            "log_collection": pubsub_broker.log_collection,
        },
    )


@app.post("/deploy", response_model=DeployJob)
def deploy(config: DeploymentConfig):
    """
    Creates a new application deployment using Cloud Build.
    """
    substitutions = {
        "_GRADIENT_NAME": config.style.gradient_name,
        "_ASCII_FONT": config.style.ascii_font,
        "_TITLE_FONT": config.style.title_font,
    }
    active_builds = get_active_builds()
    if len(active_builds) > 0:
        raise HTTPException(503, detail="Another deployment already in progress")
    try:
        build_id = trigger_build({k: v for k, v in substitutions if v is not None})
    except HTTPError:
        raise HTTPException(502, detail="Unable to trigger deployment")

    return DeployJob(id=build_id)


@app.on_event("startup")
async def startup():
    # Prime the Pub/Sub log broker
    await pubsub_broker.generator.asend(None)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await pubsub_broker.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message text was: {data}")
    except WebSocketDisconnect:
        pubsub_broker.disconnect(websocket)


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse("static/favicon.ico")

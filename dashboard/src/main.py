import time

import requests
import uvicorn
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.responses import FileResponse
from starlette.websockets import WebSocketDisconnect

from models.app import AppTheme
from models.build import BuildRef
from services import AppService, CloudBuildService, Notifier

templates = Jinja2Templates(directory="templates")

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

notifier = Notifier()
appsvc = AppService.load_from_config("apps.yaml")
appsvc.notifier = notifier


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse(
        name="index.html",
        context={
            "request": request,
            "apps": appsvc.get_apps(),
            "debug": app.debug,
            "unix_timestamp": int(time.time()),
        },
    )


@app.post("/deploy")
def deploy(theme: AppTheme, background_tasks: BackgroundTasks):
    """
    Trigger a Cloud Build job to deploy a new app version.
    """
    try:
        build_ref = appsvc.deploy_update(theme, monitor=True)
    except Exception as e:
        raise HTTPException(502, detail=f"Unable to trigger deployment: {e}")
    return build_ref.id


@app.get("/build/{id}")
def build(id: str):
    cb = CloudBuildService()
    return cb.get_build(id)


@app.on_event("startup")
async def startup():
    await appsvc.refresh_app_data()
    # Prime the Pub/Sub log broker
    await notifier.generator.asend(None)


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
    app.debug = True
    uvicorn.run(app, host="0.0.0.0", port=8000, debug=True)

import logging.config
import time

import uvicorn
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.responses import FileResponse
from starlette.websockets import WebSocketDisconnect

from config import settings
from models import AppTheme
from services import AppService, CloudBuildService, Notifier

logging.config.dictConfig(settings.logging_config)

templates = Jinja2Templates(directory="templates")

app = FastAPI(debug=settings.debug)
app.mount("/static", StaticFiles(directory="static"), name="static")

notifier = Notifier()
appsvc = AppService.load_from_config("apps.yaml", notifier=notifier)


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse(
        name="index.html",
        context={
            "request": request,
            "app_service": appsvc,
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
        build_ref = appsvc.deploy_update(theme)
        background_tasks.add_task(appsvc.start_build_monitor, build_ref)
    except Exception as e:
        raise HTTPException(502, detail=f"Unable to trigger deployment: {e}")
    return {"id": build_ref.id}


@app.get("/build/{id}")
def build(id: str):
    cb = CloudBuildService()
    return cb.get_build(id)


@app.on_event("startup")
async def startup():
    # await appsvc.refresh_app_data()

    # prime generators (https://stackoverflow.com/a/19892334)
    notifier.save_file_generator.send(None)
    await notifier.notification_generator.asend(None)


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

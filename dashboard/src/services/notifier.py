import json
import logging
from typing import Any, Dict, List

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

from models import Message

logger = logging.getLogger("dashboard." + __name__)


class Notifier:
    def __init__(self):
        self.connections: List[WebSocket] = list()
        self.notification_generator = self.get_notification_generator()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.append(websocket)
        logger.debug("Websocket connected (%s)", websocket.client.host, icon="🔌")

    def disconnect(self, websocket: WebSocket):
        try:
            self.connections.remove(websocket)
            logger.debug("Websocket disconnected (%s)", websocket.client.host, icon="🔌")
        except ValueError:
            pass

    async def get_notification_generator(self):
        while True:
            message = yield
            await self._notify(message)

    async def _notify(self, message: str):
        # https://github.com/tiangolo/fastapi/issues/258
        living_connections = []
        while len(self.connections) > 0:
            # Looping like this is necessary in case a disconnection is handled
            # during await websocket.send_text(message)
            websocket = self.connections.pop()
            try:
                await websocket.send_text(message)
                living_connections.append(websocket)
            except RuntimeError:
                continue
        self.connections = living_connections

    async def send(
        self, topic: str, obj: Any = None, opts: Dict[str, Any] = {}, **extra: Any
    ):
        try:
            data = jsonable_encoder(obj, **opts) if obj else {}
            data.update(extra)
            message = Message(topic=topic, data=data)
            await self.notification_generator.asend(message.json())
        except Exception:
            logger.exception("Error sending message")

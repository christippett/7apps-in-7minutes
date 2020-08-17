import logging
from typing import Any, List

from fastapi import WebSocket

from models import Message

logger = logging.getLogger(__name__)


class Notifier:
    def __init__(self):
        self.connections: List[WebSocket] = list()
        self.notification_generator = self.get_notification_generator()

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
            await websocket.send_text(message)
            living_connections.append(websocket)
        self.connections = living_connections

    async def send(self, message: Message = None, **data: Any):
        if message is None:
            message = Message.parse_obj(data)
        await self.notification_generator.asend(message.json())

    async def connect(self, websocket: WebSocket):
        logger.debug("New websocket connection from %s", websocket.client.host)
        await websocket.accept()
        self.connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.connections.remove(websocket)

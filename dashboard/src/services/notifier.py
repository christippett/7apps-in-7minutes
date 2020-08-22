import json
import logging
from typing import Any, List

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
        self.connections.remove(websocket)
        logger.debug("Websocket disconnected (%s)", websocket.client.host, icon="🔌")

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

    async def send(self, topic: str, model: BaseModel = None, **kwargs: Any):
        if isinstance(model, Message):
            message = model
            message.topic = topic
        elif model is not None:
            message = Message(topic=topic, data=model.dict(by_alias=True))
        else:
            data = kwargs.pop("data", {})
            if isinstance(data, str):
                data = {"text": data}
            data.update(kwargs)
            message = Message(topic=topic, data=data)

        try:
            message_data = jsonable_encoder(message)
            await self.notification_generator.asend(json.dumps(message_data))
        except Exception:
            logger.exception("Error sending message")

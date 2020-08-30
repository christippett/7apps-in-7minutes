import json
from datetime import datetime, timedelta

from fastapi.encoders import jsonable_encoder

from google.protobuf import timestamp_pb2

from common.config import settings


class TaskService:
    def __init__(self):
        self.client = settings.gcp.tasks

    def create_task(self, data, name=None, delay: timedelta = None):
        body = json.dumps(jsonable_encoder(data)).encode()
        task = {
            "name": name,
            "http_request": {  # Specify the type of request.
                "http_method": "POST",
                "headers": {"Content-type": "application/json"},
                "url": "https://7apps.cloud/tasks",
                "body": body,
            },
        }
        if delay:
            d = datetime.utcnow() + delay
            timestamp = timestamp_pb2.Timestamp()
            task["schedule_time"] = timestamp.FromDatetime(d)
        return self.client.create_task(settings.cloud_tasks_queue_name, task)

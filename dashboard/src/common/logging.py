import logging
from copy import copy

import google.cloud.logging
from uvicorn.logging import ColourizedFormatter

LOG_ICONS = {
    logging.CRITICAL: "🔥",
    logging.ERROR: "🛑",
    logging.WARNING: "⚠️",
    logging.INFO: "📘",
    logging.DEBUG: "🧪",
}


class ColourFormatter(ColourizedFormatter):
    def formatMessage(self, record):
        recordcopy = copy(record)
        if self.use_colors:
            recordcopy.__dict__["name"] = self.color_level_name(
                "[" + record.name + "]", record.levelno
            )
        return super().formatMessage(recordcopy)


class IconFilter(logging.Filter):
    def filter(self, record: logging.LogRecord):
        if "icon" not in record.__dict__:
            record.__dict__["icon"] = LOG_ICONS.get(record.levelno)
        return True


class IconLogger(logging.Logger):
    def _log(self, level, msg, args, **kwargs):
        extra = kwargs.pop("extra", {})
        if "icon" in kwargs:
            extra["icon"] = kwargs.pop("icon")
        super()._log(level, msg, args, extra=extra, **kwargs)


def setup_stackdriver_logging():
    client = google.cloud.logging.Client()
    formatter = logging.Formatter("%(icon)s %(message)s")
    handler = client.get_default_handler()
    handler.addFilter(IconFilter())
    handler.setFormatter(formatter)
    logger = logging.getLogger("dashboard")
    logger.setLevel(logging.DEBUG)
    logger.handlers = [handler]
    logger.propagate = False


logging.setLoggerClass(IconLogger)

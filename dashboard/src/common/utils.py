import logging
from asyncio import Future

logger = logging.getLogger("dashboard." + __name__)


def future_exception_handler(future: Future):
    exc = future.exception()
    if exc is not None:
        logger.error("Future exception: %s", exc, exc_info=exc, icon="🔮")

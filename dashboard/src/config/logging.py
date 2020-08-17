LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"standard": {"format": "%(levelname)-9s [%(name)s]  %(message)s"}},
    "handlers": {
        "default": {
            "level": "DEBUG",
            "formatter": "standard",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",  # Default is stderr
        },
    },
    "loggers": {
        "services": {"handlers": ["default"], "level": "DEBUG", "propagate": False},
        "models": {"handlers": ["default"], "level": "DEBUG", "propagate": False},
    },
}

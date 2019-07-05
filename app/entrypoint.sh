#!/bin/bash
set -ex

if [ ! "$ENVIRONMENT" = "Google Compute Engine" ]; then
    # If not running on Google Compute Engine, run gunicorn directly
    gunicorn --bind 0.0.0.0:8080 main:app
else
    # Supervisor will run nginx, gunicorn and certbot
    supervisord --nodaemon -c /app/scripts/supervisord.conf
fi

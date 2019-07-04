#!/bin/bash

set -x

export PYTHONPATH=/app:$PYTHONPATH
export CERTBOT_EMAIL=chris.tippett@servian.com

# If not running on Google Compute Engine, run gunicorn directly
if [ ! "$ENVIRONMENT" = "Google Compute Engine" ]; then
    (cd /app; gunicorn --bind 0.0.0.0:8080 main:app)
else

# Start gunicorn in the background
(cd /app; gunicorn --bind 0.0.0.0:8080 main:app) &
sleep 15

# If running on Google Compute Engine, setup nginx and certbot
rm -rf /etc/nginx/sites-available/*

cat <<EOF >/etc/nginx/conf.d/certbot.conf
server {
    # Listen on plain old HTTP
    listen 80 default_server;
    listen [::]:80 default_server;

    # Pass this particular URL off to certbot, to authenticate HTTPS certificates
    location '/.well-known/acme-challenge' {
        default_type "text/plain";
        proxy_pass http://localhost:1337;
    }

    # Everything else gets shunted over to HTTPS
    location / {
        return 301 https://gce.servian.fun$request_uri;
    }
}
EOF

cat <<EOF >/etc/nginx/conf.d/app.conf
server {
    listen 443 ssl;
    server_name gce.servian.fun;
    ssl_certificate     /etc/letsencrypt/live/gce.servian.fun/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gce.servian.fun/privkey.pem;

    location / {
        include proxy_params;
        proxy_pass http://127.0.0.1:8080;
    }
}
EOF

. /scripts/entrypoint.sh &> /var/log/app.log

fi
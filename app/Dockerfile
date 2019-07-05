FROM python:3.7-slim-stretch

WORKDIR /app

# The following is required to install supervisor, nginx and certbot for Google Compute Engine
RUN apt-get update && \
    apt-get install -y gnupg2 && \
    echo "deb http://ppa.launchpad.net/certbot/certbot/ubuntu xenial main" >> /etc/apt/source.list && \
    echo "deb-src http://ppa.launchpad.net/certbot/certbot/ubuntu xenial main" >> /etc/apt/source.list && \
    apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 7BF576066ADA65728FC7E70A8C47BE8E75BCA694 && \
    apt-get update && \
    apt-get install -y supervisor nginx python-certbot-nginx && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Configure nginx (for Google Compute Engine)
RUN rm -rf /etc/nginx/sites-available/*
ADD scripts/certbot.conf /etc/nginx/conf.d/
ADD scripts/app.conf /etc/nginx/conf.d/
VOLUME /etc/letsencrypt
ENV CERTBOT_EMAIL=chris.tippett@servian.com

# Install app dependencies
RUN pip install gunicorn
ADD requirements.txt .
RUN pip install -r requirements.txt

# Copy app source
ADD . /app/

# Expose ports for gunicorn (8080) and nginx (80, 443)
EXPOSE 80
EXPOSE 443
EXPOSE 8080

ENTRYPOINT ["/bin/bash"]
CMD ["/app/entrypoint.sh"]
FROM python:3.7-slim-stretch

# The following dependencies are needed for running on Google Compute Engine
RUN apt-get update && \
    apt-get install -y gnupg2 && \
    echo "deb http://ppa.launchpad.net/certbot/certbot/ubuntu xenial main" >> /etc/apt/source.list && \
    echo "deb-src http://ppa.launchpad.net/certbot/certbot/ubuntu xenial main" >> /etc/apt/source.list && \
    apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 7BF576066ADA65728FC7E70A8C47BE8E75BCA694 && \
    apt-get update && \
    apt-get install -y supervisor nginx python-certbot-nginx && \
    apt-get autoremove -y && \
    apt-get clean
RUN rm -rf /etc/nginx/sites-available/*
ADD scripts/certbot.conf /etc/nginx/conf.d/
ADD scripts/app.conf /etc/nginx/conf.d/
ENV CERTBOT_EMAIL=chris.tippett@servian.com
VOLUME /etc/letsencrypt

# Install app dependencies
WORKDIR /app
RUN pip install gunicorn
ADD requirements.txt .
RUN pip install -r requirements.txt

# Copy app source
COPY . /app/

EXPOSE 80
EXPOSE 443
EXPOSE 8080

# CMD ["gunicorn", "--bind", "0.0.0.0:8080", "main:app"]
ENTRYPOINT ["/bin/bash"]
CMD ["/app/entrypoint.sh"]

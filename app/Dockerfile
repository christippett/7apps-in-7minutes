FROM python:3.7-slim-stretch

WORKDIR /app

# gunicorn is only needed when running as a container
RUN pip install gunicorn

# install dependencies before copying source code
ADD requirements.txt .
RUN pip install -r requirements.txt

# copy app source
ADD . /app/

EXPOSE 8080

ENTRYPOINT ["gunicorn", "--bind", "0.0.0.0:8080", "main:app"]

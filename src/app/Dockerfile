FROM python:3.8-slim-buster

WORKDIR /app

# install dependencies before copying source code
ADD requirements.txt .
RUN pip install -r requirements.txt

# copy app source
ADD . /app/

EXPOSE 8080

ENTRYPOINT ["gunicorn", "--bind", "0.0.0.0:8080", "main:app"]

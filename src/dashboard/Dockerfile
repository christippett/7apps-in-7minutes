FROM python:3.8-slim-buster

WORKDIR /app

# install dependencies before copying source code
ADD requirements.txt .
RUN pip install -r requirements.txt

# copy app source
ADD . /app/
ADD ./static/favicon.ico /app/

EXPOSE 8080

CMD ["python"]
ENTRYPOINT ["main.py"]

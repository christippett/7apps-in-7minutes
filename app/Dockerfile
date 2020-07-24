FROM python:3.8-slim-buster

WORKDIR /app

# Install dependencies
ADD src/requirements.txt .
RUN pip install -r requirements.txt

# Copy source code
ADD src /app/

EXPOSE 8080

ARG VERSION
ENV VERSION $VERSION

ENTRYPOINT ["gunicorn", "--bind", "0.0.0.0:8080", "main:app"]

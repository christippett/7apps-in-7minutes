FROM python:3.8-slim-buster

WORKDIR /app

# Install dependencies
ADD src/requirements.txt .
RUN pip install -r requirements.txt

# Copy source code
ADD src /app/

# App configuration
ARG VERSION
ARG GRADIENT
ARG FONT
ARG ASCII_FONT

ENV VERSION="$VERSION"
ENV GRADIENT="$GRADIENT"
ENV FONT="$FONT"
ENV ASCII_FONT="$ASCII_FONT"

EXPOSE 8080

ENTRYPOINT ["gunicorn", "--bind", "0.0.0.0:8080", "main:app"]

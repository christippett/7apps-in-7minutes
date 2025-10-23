FROM python:3.8-slim

ENV APP_HOME /app
ENV PYTHONUNBUFFERED TRUE

WORKDIR $APP_HOME

RUN pip install functions-framework

# Install dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy source code
COPY src .

# App configuration
ARG VERSION
ARG GRADIENT
ARG FONT
ARG ASCII_FONT

ENV VERSION="$VERSION"
ENV GRADIENT="$GRADIENT"
ENV FONT="$FONT"
ENV ASCII_FONT="$ASCII_FONT"

CMD exec functions-framework --target=main

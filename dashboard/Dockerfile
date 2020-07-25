FROM tiangolo/uvicorn-gunicorn-fastapi:python3.8

# Copy Google Cloud SDK
COPY --from=gcr.io/google.com/cloudsdktool/cloud-sdk:alpine /google-cloud-sdk /google-cloud-sdk

ENV CLOUDSDK_HOME /google-cloud-sdk
ENV PYTHONPATH $PYTHONPATH:$CLOUDSDK_HOME/lib

# Install Poetry
RUN curl -sSL https://raw.githubusercontent.com/python-poetry/poetry/master/get-poetry.py | POETRY_HOME=/opt/poetry python && \
    cd /usr/local/bin && \
    ln -s /opt/poetry/bin/poetry && \
    poetry config virtualenvs.create false

# Copy using poetry.lock* in case it doesn't exist yet
COPY pyproject.toml poetry.lock* /app/

RUN poetry install --no-root --no-dev

ADD src .env /app/

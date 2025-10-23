FROM tiangolo/uvicorn-gunicorn-fastapi:python3.9

# Install Poetry
ENV POETRY_HOME=/opt/poetry
ENV PATH=$PATH:$POETRY_HOME

ADD https://raw.githubusercontent.com/python-poetry/poetry/master/get-poetry.py /opt/poetry/

RUN /opt/poetry/get-poetry.py && poetry config virtualenvs.create false

# Copy using poetry.lock* in case it doesn't exist yet
COPY pyproject.toml poetry.lock* /app/

RUN poetry install --no-root --no-dev

ADD src /app/

ENV MAX_WORKERS=1

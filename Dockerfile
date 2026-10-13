FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./
COPY migrations ./migrations
COPY backend ./backend
COPY collectors ./collectors
COPY examples ./examples

RUN useradd --create-home --uid 10001 sentinelai \
    && mkdir /data \
    && chown -R sentinelai:sentinelai /app /data

USER sentinelai

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.app.api:app --host 0.0.0.0 --port 8000"]

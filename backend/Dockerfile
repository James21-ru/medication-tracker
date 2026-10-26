FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
COPY alembic.ini ./
COPY alembic ./alembic

EXPOSE 8000
# A web service must bind its HTTP port promptly.  Running network-bound schema
# migrations in this command prevents the platform health check from ever
# reaching the API when a database is slow to wake up.  Apply Alembic migrations
# as an explicit release/dev operation instead.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

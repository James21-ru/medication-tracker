FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
COPY alembic.ini ./
COPY alembic ./alembic

EXPOSE 8000
# Timeweb's health path is also configured to /health.  Use the Python
# standard library so the slim image needs no extra curl package.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)" || exit 1
# A web service must bind its HTTP port promptly.  Running network-bound schema
# migrations in this command prevents the platform health check from ever
# reaching the API when a database is slow to wake up.  Apply Alembic migrations
# as an explicit release/dev operation instead.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

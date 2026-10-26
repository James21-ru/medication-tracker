from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import cabinets, health, medications
from app.core.config import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", docs_url="/docs", openapi_url="/openapi.json")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Keep the platform liveness probe outside the versioned API namespace.  It is
# intentionally independent of Postgres and all other external services.
app.add_api_route("/health", health.health, methods=["GET"], tags=["health"])
app.include_router(health.router, prefix="/api/v1")
app.include_router(cabinets.router, prefix="/api/v1")
app.include_router(medications.router, prefix="/api/v1")

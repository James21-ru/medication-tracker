from functools import lru_cache
from pathlib import Path
import re
from uuid import UUID

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_name: str = "LifeCare Local API"
    database_url: str = "postgresql+psycopg://lifecare:lifecare@localhost:5432/lifecare"
    database_url_unpooled: str | None = None
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    local_test_user_id: UUID = UUID("00000000-0000-0000-0000-000000000001")
    # Neon CLI writes managed variables to the repository-root `.env.local`.
    # The Vite app has its own nested `.env.local`, so the database URL remains
    # server-only and is never embedded in the browser bundle.
    model_config = SettingsConfigDict(env_file=(".env", PROJECT_ROOT / ".env.local"), extra="ignore")

    @field_validator("database_url", "database_url_unpooled", mode="before")
    @classmethod
    def normalize_database_url(cls, value: object) -> str | None:
        """Accept PostgreSQL URLs copied from managed-provider dashboards.

        Hosting control panels sometimes preserve surrounding quotes or a
        ``DATABASE_URL=`` assignment when a value is pasted.  Accept those
        harmless variants so a deploy does not fail before the API starts.
        """
        # ``BaseSettings`` validates optional defaults too.  Preserve a real
        # missing DATABASE_URL_UNPOOLED rather than converting it to the
        # literal (and invalid) SQLAlchemy URL "None".
        if value is None:
            return None

        url = str(value).strip()
        assignment = re.match(r"^(?:export\s+)?DATABASE_URL\s*[:=]\s*(.+)$", url, flags=re.IGNORECASE)
        if assignment:
            url = assignment.group(1).strip()
        # Dashboard copy buttons and shell snippets can add quote/backtick
        # wrappers.  These characters are never part of a PostgreSQL URL.
        url = url.strip(" \\t\\r\\n'\"`")
        pasted_url = re.search(r"postgres(?:ql)?(?:\+[a-z0-9_]+)?://[^\s'\"`]+", url, flags=re.IGNORECASE)
        if pasted_url:
            url = pasted_url.group(0)
        if url.startswith("postgres://"):
            return "postgresql+psycopg://" + url.removeprefix("postgres://")
        if url.startswith("postgresql://"):
            return "postgresql+psycopg://" + url.removeprefix("postgresql://")
        if url.startswith("postgresql+asyncpg://"):
            return "postgresql+psycopg://" + url.removeprefix("postgresql+asyncpg://")
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [value.strip() for value in self.cors_origins.split(",") if value.strip()]

    @property
    def sync_database_url(self) -> str:
        return self.database_url

    @property
    def migration_database_url(self) -> str:
        """Prefer the provider's direct connection for schema migrations."""
        return self.database_url_unpooled or self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()

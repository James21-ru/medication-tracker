from functools import lru_cache
from uuid import UUID

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "LifeCare Local API"
    database_url: str = "postgresql+psycopg://lifecare:lifecare@localhost:5432/lifecare"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    local_test_user_id: UUID = UUID("00000000-0000-0000-0000-000000000001")
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: object) -> str:
        """Accept standard PostgreSQL URLs from managed providers such as Neon."""
        url = str(value)
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


@lru_cache
def get_settings() -> Settings:
    return Settings()

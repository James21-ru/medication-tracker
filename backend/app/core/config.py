from functools import lru_cache
from uuid import UUID

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "LifeCare Local API"
    database_url: str = "postgresql+asyncpg://lifecare:lifecare@localhost:5432/lifecare"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    local_test_user_id: UUID = UUID("00000000-0000-0000-0000-000000000001")
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [value.strip() for value in self.cors_origins.split(",") if value.strip()]

    @property
    def sync_database_url(self) -> str:
        return self.database_url.replace("+asyncpg", "+psycopg")


@lru_cache
def get_settings() -> Settings:
    return Settings()

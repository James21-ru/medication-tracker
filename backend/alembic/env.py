from hashlib import sha256
from logging import getLogger
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_settings
from app.db.base import Base
import app.db.models  # noqa: F401

config = context.config
settings = get_settings()
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata
logger = getLogger("alembic.env")


def _url_diagnostic(url: str) -> str:
    """Return only non-sensitive data about a configured database URL.

    A hosting dashboard can accidentally save an assignment, quote, or another
    environment value in ``DATABASE_URL``.  Logs must help identify that case
    without ever printing credentials, the database hostname, or query values.
    """
    scheme = url.partition(":")[0] or "missing"
    fingerprint = sha256(url.encode("utf-8")).hexdigest()[:12]
    return (
        f"scheme={scheme!r}, length={len(url)}, "
        f"postgres_url={url.startswith('postgres')}, fingerprint={fingerprint}"
    )


def run_migrations_offline() -> None:
    context.configure(url=settings.migration_database_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Keep the provider URL out of Alembic's ConfigParser interpolation.  A
    # managed PostgreSQL URL may include query-string characters which are
    # valid for SQLAlchemy but can be altered while travelling through an INI
    # setting.  The application setting is already validated and normalized.
    database_url = settings.migration_database_url
    logger.warning("Migration database URL diagnostic: %s", _url_diagnostic(database_url))
    connectable = create_engine(database_url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

"""Telegram Mini App request authentication.

Telegram signs ``initData`` for each Web App launch.  The API verifies that
signature server-side before it reads or writes a user's synced state.
"""

from __future__ import annotations

from hashlib import sha256
import hmac
import json
from time import time
from urllib.parse import parse_qsl

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


def telegram_user_id_from_init_data(init_data: str, bot_token: str, max_age_seconds: int) -> str:
    """Validate Telegram WebApp init data and return its immutable user id."""
    values = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = values.pop("hash", None)
    if not received_hash:
        raise ValueError("Telegram не передал подпись запуска.")

    try:
        auth_date = int(values["auth_date"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("Telegram не передал дату авторизации.") from error
    if auth_date > int(time()) + 60 or int(time()) - auth_date > max_age_seconds:
        raise ValueError("Сессия Telegram устарела. Откройте мини-приложение ещё раз.")

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(values.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), sha256).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), sha256).hexdigest()
    if not hmac.compare_digest(expected_hash, received_hash):
        raise ValueError("Не удалось подтвердить Telegram-профиль.")

    try:
        user = json.loads(values["user"])
        telegram_id = str(user["id"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise ValueError("Telegram не передал профиль пользователя.") from error
    if not telegram_id.isdigit():
        raise ValueError("Некорректный идентификатор Telegram-пользователя.")
    return telegram_id


async def current_telegram_user_id(
    x_telegram_init_data: str | None = Header(default=None),
) -> str:
    settings = get_settings()
    token = settings.telegram_bot_token.get_secret_value() if settings.telegram_bot_token else ""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Синхронизация временно не настроена на сервере.",
        )
    if not x_telegram_init_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Откройте приложение из Telegram для синхронизации.",
        )
    try:
        return telegram_user_id_from_init_data(
            x_telegram_init_data,
            token,
            settings.telegram_init_data_max_age_seconds,
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error

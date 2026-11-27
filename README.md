# Medication Tracker

Private iOS-first medication tracker MVP. It helps people remember and log planned medication intake without providing medical advice.

## Product scope

The first version works fully offline. A person adds medications and schedules, receives device notifications, and records each planned dose as taken or skipped.

The detailed product decisions live in [`docs/`](docs/).

## Architecture

- `mobile/`: Expo + React Native + TypeScript, локальное хранение в SQLite.
- `telegram-mini-app/`: React + TypeScript + Vite. Действующий интерфейс находится в `src/rebuild/`, хранит локальную копию и ожидающие изменения отдельно для каждого аккаунта Telegram.
- `supabase/`: действующие функции `telegram-mini-session` и `telegram-chatbot`. Общая копия аптечки хранится в `mobile_auth.telegram_mini_app_states` с проверкой версии при записи.
- `backend/`: прежний FastAPI и отдельный путь `/sync/state`. Действующий интерфейс `src/rebuild/` его не использует.

Функция `telegram-mini-session` проверяет подписанные данные Telegram. Клиент получает состояние и `revision`, а при записи передает `expected_revision`. Сервер атомарно отклоняет устаревшие записи с кодом 409. Независимые изменения объединяются, пересекающиеся требуют решения пользователя. Токен бота и доступ к базе остаются только на сервере.

## Local PostgreSQL and API

Install Docker Desktop and run from the repository root:

```bash
docker compose up --build
```

PostgreSQL starts on `localhost:5433`; FastAPI starts on `http://localhost:8000`. The first migration runs automatically. Port `5433` avoids conflict with a PostgreSQL instance that may already use the conventional local port `5432`.

- Health: `http://localhost:8000/api/v1/health`
- API docs: `http://localhost:8000/docs`

The first schema covers аптечки, препараты, упаковки, расписания и события приемов. The initial API exposes cabinet creation/renaming, medication CRUD and package creation.

### Локальная проверка мини-приложения

Для интерфейса без Telegram и сетевой синхронизации отдельный API не нужен:

```bash
cd telegram-mini-app
npm ci
npm test
npm run build
npm run dev
```

В новой локальной копии не задавайте `VITE_SUPABASE_URL` и не переносите рабочие `.env`. Обычный браузер сохраняет данные локально. Клиентские тесты моделируют два независимых устройства и сервер с проверкой версии, без подключений к Telegram или Supabase.

Для серверных проверок создайте отдельный локальный PostgreSQL с пустой базой `lifecare_sync_test`. Из корня установите зависимости командой `npm ci`, затем запустите `npm run test:sync-server`, задав `TEST_DATABASE_URL` для этой базы на `127.0.0.1`. Без переменной интеграционные тесты пропускаются. Тесты допускают только локальный адрес и точное имя тестовой базы.

Для синхронизации внутри Telegram нужен `VITE_SUPABASE_URL` согласованного проекта и обновленная функция `telegram-mini-session`. Изменения протокола клиента и сервера должны выпускаться согласованно. Подробности: [docs/telegram-mini-app.md](docs/telegram-mini-app.md).

## Technology

- Expo + React Native + TypeScript
- Expo Router
- SQLite for on-device data
- Expo Notifications for local reminders
- React 19 + Vite for the Telegram Mini App
- FastAPI + SQLAlchemy + Alembic + PostgreSQL for the local API

## Status

Architecture and user flows are approved. The next milestone is an interactive iOS prototype of the Today screen.

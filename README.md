# Medication Tracker

Private iOS-first medication tracker MVP. It helps people remember and log planned medication intake without providing medical advice.

## Product scope

The first version works fully offline. A person adds medications and schedules, receives device notifications, and records each planned dose as taken or skipped.

The detailed product decisions live in [`docs/`](docs/).

## Architecture

- `mobile/` — Expo + React Native + TypeScript. The native client remains offline-first with SQLite.
- `telegram-mini-app/` — React 19 + TypeScript + Vite. The Mini App keeps local storage during an endpoint-by-endpoint migration so current test flows remain fast and reliable.
- `backend/` — new FastAPI + SQLAlchemy + Alembic API for local PostgreSQL development.
- `supabase/` — legacy functions/migrations, retained until the Telegram bot server flow is migrated and verified.

The FastAPI database is local development infrastructure, not a cloud account system. The development API uses a fixed local owner ID; authentication and cloud sync require a separate design before remote deployment.

## Local PostgreSQL and API

Install Docker Desktop and run from the repository root:

```bash
docker compose up --build
```

PostgreSQL starts on `localhost:5433`; FastAPI starts on `http://localhost:8000`. The first migration runs automatically. Port `5433` avoids conflict with a PostgreSQL instance that may already use the conventional local port `5432`.

- Health: `http://localhost:8000/api/v1/health`
- API docs: `http://localhost:8000/docs`

The first schema covers аптечки, препараты, упаковки, расписания и события приёмов. The initial API exposes cabinet creation/renaming, medication CRUD and package creation.

### Test the Telegram Mini App against the local API

Keep `docker compose up --build` running. In a second terminal window run:

```bash
cd telegram-mini-app
npm run dev
```

Open the local Vite address that it prints (normally `http://localhost:5173`) in a desktop browser. `telegram-mini-app/.env.local` configures this local browser build to use `http://localhost:8000/api/v1`; it is intentionally ignored by Git and must never be used for a deployed Telegram Mini App.

The current migration covers the cabinet data vertical: cabinets, medications and packages. Reminder schedules and dose events remain in the device cache until their corresponding API endpoints are introduced.

## Technology

- Expo + React Native + TypeScript
- Expo Router
- SQLite for on-device data
- Expo Notifications for local reminders
- React 19 + Vite for the Telegram Mini App
- FastAPI + SQLAlchemy + Alembic + PostgreSQL for the local API

## Status

Architecture and user flows are approved. The next milestone is an interactive iOS prototype of the Today screen.

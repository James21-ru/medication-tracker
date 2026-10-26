# Koyeb + Neon: постоянный dev-стенд

Этот контур предназначен только для тестовых данных. До появления проверки Telegram `initData` не добавляйте в него данные реальных пользователей.

## 1. Neon: PostgreSQL

1. Создайте проект в Neon и базу данных `lifecare_dev`.
2. В разделе **Connect** скопируйте pooled connection string. Она должна содержать `sslmode=require`.
3. Сохраните строку только как секрет `DATABASE_URL` в Koyeb. Не добавляйте её в GitHub, `.env.example` или чат.

## 2. Koyeb: FastAPI

1. Подключите GitHub-репозиторий `James21-ru/medication-tracker`.
2. Создайте Web Service из ветки `main`.
3. В Docker settings укажите путь к Dockerfile: `backend/Dockerfile`; build context: `backend`.
4. Откройте HTTP-порт, который Koyeb задаёт через `PORT`; маршрут — `/`.
5. Добавьте secrets/environment variables:

   ```text
   DATABASE_URL=<Neon pooled connection string>
   CORS_ORIGINS=https://james21-ru.github.io
   ```

   После публикации Mini App домен нужно указать точно, без завершающего `/`.
6. В health check укажите `/api/v1/health`.
7. После deploy скопируйте публичный HTTPS-домен Koyeb, например `https://lifecare-api-<org>.koyeb.app`.

## 3. GitHub Pages: Mini App

В GitHub repository secrets добавьте:

```text
VITE_API_BASE_URL=https://<ваш-домен-Koyeb>/api/v1
```

Затем запустите workflow **Deploy Telegram Mini App** повторно либо внесите изменение в `telegram-mini-app/`. Vite встраивает эту переменную в клиентский build.

## Проверка

1. Откройте `https://<ваш-домен-Koyeb>/docs` — должна быть доступна спецификация API.
2. Откройте опубликованный Mini App и создайте тестовую аптечку с препаратом.
3. Обновите Mini App: аптечка, препарат и упаковка должны сохраниться.
4. В Neon Table Editor проверьте записи в `cabinets`, `medications` и `medication_packages`.

## Ограничения текущей миграции

- С сервером синхронизируются аптечки, препараты и упаковки.
- Расписания и факты приёмов пока остаются локальными.
- Нет production-авторизации; перед приглашением тестировщиков нужен backend-проверяющий Telegram `initData` и пользовательская изоляция данных.

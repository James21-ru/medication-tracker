# LifeCare Telegram Mini App

`telegram-mini-app/` is a separate web client for the two core LifeCare areas:

- **Приёмы** — today's planned events and one-tap taken/skipped updates;
- **Аптечка** — cloud-backed packages with current stock and the nearest expiry date;
- **Таблетница** — a deep link (`lifecare://`) to the native LifeCare app.

It deliberately reads and writes the same Supabase tables as the planned mobile sync. It does not copy the local SQLite database. Until the React Native sync client is enabled, data created solely on a device remains local and will not appear in the Mini App.

## Secure Telegram session

The Mini App sends `Telegram.WebApp.initData` to the `telegram-mini-session` Edge Function. The function validates Telegram's HMAC signature and a 24-hour `auth_date`, finds or creates the same Supabase user as the native Telegram OIDC flow, then returns a one-time Supabase token hash. The browser exchanges that hash using `verifyOtp`; no bot token or service key reaches the browser.

Set the Edge Function secrets (never in `.env` for the Mini App). The function needs a server-only database connection to create a medication, its package, schedule and dose events atomically:

```sh
supabase secrets set \
  TELEGRAM_BOT_TOKEN='replace-with-a-rotated-bot-token' \
  LIFECARE_DB_URL='postgresql://<server-only-connection-string>' \
  LIFECARE_SERVICE_ROLE_KEY='<service-role-key>'
supabase functions deploy telegram-mini-session --no-verify-jwt
```

The existing bot token was previously pasted into a chat, so rotate it in **@BotFather** before setting this secret.
Use a server-side Database connection string and the service-role key from the Supabase dashboard. `SUPABASE_URL` is provided to Edge Functions by Supabase itself. Do not put the database URL, bot token or service-role key into GitHub Actions, the Mini App environment or source control. `VITE_SUPABASE_PUBLISHABLE_KEY` is the only Supabase key that belongs in the browser build.

## Local development

```sh
cd telegram-mini-app
cp .env.example .env.local
npm install
npm run dev
```

Telegram requires an HTTPS URL. Use an approved HTTPS preview host for a real in-Telegram test, set it as the bot's Menu Button / Web App URL in @BotFather, then deploy the static `dist/` folder there:

```sh
npm run build
```

## Deployment prerequisites

1. Apply the existing cloud-sync and mobile-auth migrations to the LifeCare Supabase project.
2. Set `TELEGRAM_BOT_TOKEN` and deploy `telegram-mini-session`.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the static host.
4. Publish the Mini App over HTTPS and set that URL for the LifeCare bot's Menu Button.
5. Implement the mobile SQLite outbox/pull sync before presenting the Mini App as a shared cross-device view.

## GitHub Pages

The repository includes `.github/workflows/deploy-telegram-mini-app.yml`. In the GitHub repository open **Settings → Pages** and set **Source** to **GitHub Actions**. Then open **Settings → Secrets and variables → Actions** and add these repository secrets from the existing `mobile/.env` file:

- `VITE_SUPABASE_URL` — the value of `EXPO_PUBLIC_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY` — the value of `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

The workflow publishes the Mini App at `https://james21-ru.github.io/medication-tracker/`. Set that HTTPS address as the LifeCare bot's Menu Button / Web App URL in @BotFather after the first successful deployment.

### Supabase Storage alternative

If GitHub Pages is unavailable for the repository, create a public bucket named `lifecare-mini`. Build with `MINI_APP_BASE=/storage/v1/object/public/lifecare-mini/` and upload `dist/` into that bucket. The Mini App URL is then `https://<project-ref>.supabase.co/storage/v1/object/public/lifecare-mini/index.html`.

# Telegram login

The iOS app signs in with Telegram's OpenID Connect login through the `telegram-login` Edge Function. The function is the OIDC client: it holds the client secret, verifies Telegram's ID token and signs the user in to Supabase Auth. The app never sees the client secret, the service role key or Telegram tokens.

## Flow

```
App                         telegram-login function              Telegram (oauth.telegram.org)
 │ PKCE verifier stays here
 │── open /start?redirect_uri=lifecare://auth/telegram&code_challenge=… ─▶
 │                          stores state, nonce, own PKCE verifier
 │                          ◀── 302 to /auth?client_id=<bot id>&scope=openid profile&…
 │   (ASWebAuthenticationSession shows Telegram's page; the user confirms)
 │                          ◀── /callback?code=…&state=…
 │                          exchanges code (Basic auth + PKCE), verifies ID token:
 │                          JWKS signature, iss, aud = bot id, exp, nonce
 │                          finds or creates telegram-<id>@telegram.lifecare.invalid
 │◀── 302 lifecare://auth/telegram?code=<one-time app code>
 │── POST /session { code, code_verifier } ─▶ checks the app PKCE pair, single use
 │◀── { token_hash } ── then supabase.auth.verifyOtp({ token_hash, type: 'email' })
```

- **Telegram identity.** The numeric Telegram user id comes from the `id` claim, which needs the `profile` scope. `sub` is a different identifier and is not used. The id is the same for every bot, so a test bot and the production bot see the same user.
- **Supabase user.** Keyed by `telegram-<id>@telegram.lifecare.invalid`, the address the previous widget login used, so existing accounts keep their id. `mobile_auth.telegram_accounts` maps the user to the Telegram id.
- **One-time state.** Login attempts live in `mobile_auth.login_attempts`. Every state and app code works once, attempts expire after 10 minutes and app codes after 2 minutes.
- **Session.** supabase-js stores it in the app's SQLite-backed `localStorage` and restores it on launch. Token refresh runs while the app is in the foreground.

## No Data API needed

Nothing in the login uses the Data API (`/rest/v1`, `/graphql/v1`):

- the function reaches its tables over a direct Postgres connection (`SUPABASE_DB_URL`) and creates users through the Auth admin API (`/auth/v1`);
- the app only calls the Auth API (`verifyOtp`, `refreshSession`, `signOut`).

So it runs in a project with the Data API switched off, such as the Mini App's. Anything built later on top of this login, such as medication sync, cannot use `supabase.from()` in such a project and has to go through an Edge Function or the API.

## Database

`supabase/migrations/202609250001_mobile_auth_schema.sql` creates the `mobile_auth` schema with two tables. Client roles have no access to the schema, and RLS is on. It does not touch `public`, so it can be applied to a project that other apps use.

In a shared project, apply **only this file** (SQL Editor). Do not run `supabase db push` there, because it would also apply the mobile sync schema (`202609230001_initial_sync_schema.sql`) to that project's `public`.

## Configuration

Supabase provides `SUPABASE_URL`, `SUPABASE_DB_URL` and the service key to every function. Function secrets (`supabase secrets set …`, never in the app or the repository):

| Name | Value |
|---|---|
| `TELEGRAM_CLIENT_ID` | Bot ID shown in @BotFather → Bot Settings → Login Widget |
| `TELEGRAM_CLIENT_SECRET` | Client secret from the same screen |
| `TELEGRAM_REDIRECT_URI` | `https://<project-ref>.supabase.co/functions/v1/telegram-login/callback` (optional; this is the default) |
| `APP_REDIRECT_URIS` | `lifecare://auth/telegram` (optional; this is the default) |

@BotFather → the bot → Bot Settings → Login Widget:

- add the `TELEGRAM_REDIRECT_URI` above as an Allowed URL;
- keep the ID token algorithm on RS256 (ES256K is not supported by the verifier).

Supabase Auth settings:

- the Email provider must stay enabled, because `verifyOtp` checks the token through it;
- public sign-up can stay off: the function creates users with the admin API.

Deploy without JWT verification (`verify_jwt = false` in `supabase/config.toml`, or `--no-verify-jwt`), because Telegram and the in-app browser call the function without a Supabase JWT.

App build environment (EAS environment variables):

| Name | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key |

The app URL scheme is `lifecare` (`mobile/app.json`), so a changed scheme needs a new native build.

## Tests

Unit tests, no network or Docker:

```sh
cd supabase/functions && deno test --allow-env tests/
cd mobile && npm test
```

End-to-end against a local Supabase stack **without PostgREST** and a mock Telegram OIDC provider:

```sh
supabase start -x postgrest,studio,imgproxy,realtime,storage-api,logflare,vector,supavisor,postgres-meta,mailpit
deno run --allow-net --allow-env supabase/functions/tests/e2e/mock-telegram-oidc.ts &
cat > /tmp/telegram-login.env <<'ENV'
TELEGRAM_CLIENT_ID=123456789
TELEGRAM_CLIENT_SECRET=mock-client-secret
TELEGRAM_OIDC_ISSUER=http://host.docker.internal:55480
TELEGRAM_REDIRECT_URI=http://127.0.0.1:55421/functions/v1/telegram-login/callback
APP_REDIRECT_URIS=lifecare://auth/telegram
ENV
supabase functions serve telegram-login --env-file /tmp/telegram-login.env &
eval "$(supabase status -o env | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
cd supabase/functions && ANON_KEY="$ANON_KEY" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  deno test --allow-net --allow-env tests/e2e/telegram-login.e2e.ts
```

The local stack uses ports 55420–55429 so it can run next to other Supabase projects, and keeps public sign-up off like production.

Real Telegram, without the app: `supabase/functions/tests/manual/telegram-login-check.ts` prints a login URL, receives the return on `http://127.0.0.1:8765/callback` and shows the signed-in user. Add that URL to `APP_REDIRECT_URIS` only while testing.

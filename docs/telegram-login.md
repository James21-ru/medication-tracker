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

- **Telegram identity.** The numeric Telegram user id comes from the `id` claim, which needs the `profile` scope. `sub` is a different identifier and is not used.
- **Existing accounts.** The Supabase user is keyed by `telegram-<id>@telegram.lifecare.invalid`, the same address the previous widget login used, so existing accounts keep their id. `lifecare_profiles.telegram_user_id` stays unique.
- **One-time state.** Login attempts live in `telegram_login_attempts`. Only the service role can reach the table. Every state and app code works once, attempts expire after 10 minutes and app codes after 2 minutes.
- **Session.** The session is stored by supabase-js in the app's SQLite-backed `localStorage` and restored on launch. Token refresh runs while the app is in the foreground.
- **Mini app data.** The Telegram Mini App uses a different Supabase project. This login does not move data between the two projects.

## Configuration

Function secrets (`supabase secrets set …`, never in the app or the repository):

| Name | Value |
|---|---|
| `TELEGRAM_CLIENT_ID` | Bot ID shown in @BotFather → Bot Settings → Login Widget |
| `TELEGRAM_CLIENT_SECRET` | Client secret from the same screen |
| `TELEGRAM_REDIRECT_URI` | `https://<project-ref>.supabase.co/functions/v1/telegram-login/callback` (optional; this is the default) |
| `APP_REDIRECT_URIS` | `lifecare://auth/telegram` (optional; this is the default) |

@BotFather → the bot → Bot Settings → Login Widget:

- add the `TELEGRAM_REDIRECT_URI` above as an Allowed URL;
- keep the ID token algorithm on RS256 (ES256K is not supported by the verifier).

The function must run without JWT verification (`verify_jwt = false` in `supabase/config.toml`), because Telegram and the in-app browser call it without a Supabase JWT.

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

End-to-end against a local Supabase stack and a mock Telegram OIDC provider:

```sh
supabase start -x studio,imgproxy,realtime,storage-api,logflare,vector,supavisor,postgres-meta,mailpit
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

The local stack uses ports 55420–55429 so it can run next to other Supabase projects.

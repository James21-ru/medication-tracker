# Cloud backup and sync

## Goal

Keep LifeCare usable without a network while adding optional account-based backup and cross-device sync. The local SQLite database remains the source used by the interface; the cloud service is never required to mark a dose or view the schedule.

## Proposed stack

- Expo / React Native client with the existing SQLite repository.
- Supabase Auth and managed PostgreSQL for accounts, backup, and sync.
- Supabase Edge Function for Telegram login verification.

This is intentionally sized for an initial cohort of roughly 100 people. It uses managed operations, row-level access control, database migrations, and backups instead of operating servers ourselves.

## Data isolation

Each cloud record has `owner_id`, which is the authenticated user ID. Row Level Security allows a signed-in user to read or modify only rows with their own `owner_id`. The initial migration grants no table access to anonymous users and intentionally grants no hard-delete permission: deletions are represented by `deleted_at` so that another device can receive them.

## Synchronization contract

1. Write every action to SQLite first.
2. Add a pending sync operation to a local outbox.
3. When online and authenticated, push the outbox in creation order.
4. Pull rows changed since the saved sync cursor, including tombstones.
5. Resolve concurrent edits by server `updated_at`; dose events are never silently overwritten after they are marked taken or skipped.

The mobile client is not connected to the cloud yet. This contract and the SQL migration are the backend foundation; client sync is implemented only after the service is provisioned and tested.

## Telegram login

The app signs in with Telegram's OpenID Connect login in a secure web flow. The `telegram-login` Edge Function is the OIDC client: it keeps the client secret, verifies Telegram's ID token and issues the Supabase session. The mobile app receives no bot secret or database service key. See [telegram-login.md](telegram-login.md).

Keep email magic-link login as a recovery path: Telegram accounts can be lost or changed, while medication history must remain recoverable.

## Before production

- Create separate development and production Supabase projects.
- Apply the migration to development and test both allowed and denied RLS queries.
- Set the bot token and database service key only in Edge Function secrets.
- Decide the hosting/data-residency region and validate applicable privacy requirements.
- Implement export, account deletion, and a restore flow before onboarding real users.

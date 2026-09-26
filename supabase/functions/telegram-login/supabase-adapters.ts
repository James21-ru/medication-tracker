import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.0';
import type { Sql } from 'npm:postgres@3.4.9';

import type { Accounts, AttemptStore, TelegramIdentity } from './flow.ts';

// Tables live in the mobile_auth schema (see supabase/migrations) and are reached over a direct
// Postgres connection, so the login keeps working with the Data API (PostgREST) switched off.

/** Same address the previous widget-based login used, so existing accounts are kept. */
export function telegramUserEmail(telegramUserId: number): string {
  return `telegram-${telegramUserId}@telegram.lifecare.invalid`;
}

export function createPostgresAttemptStore(sql: Sql): AttemptStore {
  return {
    async purgeExpired(before) {
      await sql`delete from mobile_auth.login_attempts where expires_at < ${before}`;
    },

    async create(attempt) {
      await sql`
        insert into mobile_auth.login_attempts
          (state, app_redirect_uri, app_code_challenge, telegram_code_verifier, nonce, expires_at)
        values
          (${attempt.state}, ${attempt.appRedirectUri}, ${attempt.appCodeChallenge},
           ${attempt.telegramCodeVerifier}, ${attempt.nonce}, ${attempt.expiresAt})`;
    },

    async claimForCallback(state, now) {
      const [row] = await sql<{ app_redirect_uri: string; telegram_code_verifier: string; nonce: string }[]>`
        update mobile_auth.login_attempts
           set completed_at = ${now}
         where state = ${state} and completed_at is null and expires_at > ${now}
        returning app_redirect_uri, telegram_code_verifier, nonce`;
      return row ? { appRedirectUri: row.app_redirect_uri, telegramCodeVerifier: row.telegram_code_verifier, nonce: row.nonce } : null;
    },

    async finish(state, result) {
      await sql`
        update mobile_auth.login_attempts
           set app_code_hash = ${result.appCodeHash},
               token_hash = ${result.tokenHash},
               telegram_user_id = ${result.telegramUserId},
               expires_at = ${result.expiresAt}
         where state = ${state}`;
    },

    async consume(appCodeHash, now) {
      const [row] = await sql<{ app_code_challenge: string; token_hash: string }[]>`
        delete from mobile_auth.login_attempts
         where app_code_hash = ${appCodeHash} and token_hash is not null and expires_at > ${now}
        returning app_code_challenge, token_hash`;
      return row ? { appCodeChallenge: row.app_code_challenge, tokenHash: row.token_hash } : null;
    },
  };
}

export function createSupabaseAccounts(client: SupabaseClient, sql: Sql): Accounts {
  return {
    async issueLoginToken(identity: TelegramIdentity) {
      const email = telegramUserEmail(identity.telegramUserId);
      const metadata = {
        full_name: identity.name,
        telegram_id: identity.telegramUserId,
        telegram_username: identity.username,
        avatar_url: identity.picture,
      };

      // Admin user creation works even when the project disallows sign-ups; an existing user
      // (including one from the previous widget login) comes back as email_exists.
      const { error: createError } = await client.auth.admin.createUser({ email, email_confirm: true, user_metadata: metadata });
      if (createError && createError.code !== 'email_exists') throw new Error(`create user: ${createError.message}`);

      const { data, error } = await client.auth.admin.generateLink({ type: 'magiclink', email });
      const hashedToken = data?.properties?.hashed_token;
      if (error || !data?.user || !hashedToken) throw new Error(`generate link: ${error?.message ?? 'empty response'}`);

      // Existing users keep their id; refresh the Telegram profile they see in the app.
      const { error: updateError } = await client.auth.admin.updateUserById(data.user.id, { user_metadata: metadata });
      if (updateError) throw new Error(`update user: ${updateError.message}`);

      await sql`
        insert into mobile_auth.telegram_accounts (user_id, telegram_user_id, display_name)
        values (${data.user.id}, ${identity.telegramUserId}, ${identity.name})
        on conflict (user_id) do update
          set telegram_user_id = excluded.telegram_user_id,
              display_name = excluded.display_name,
              updated_at = now()`;

      return hashedToken;
    },
  };
}

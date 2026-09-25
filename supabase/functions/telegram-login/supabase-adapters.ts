import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.0';

import type { Accounts, AttemptStore, TelegramIdentity } from './flow.ts';

const TABLE = 'telegram_login_attempts';

/** Same address the previous widget-based login used, so existing accounts are kept. */
export function telegramUserEmail(telegramUserId: number): string {
  return `telegram-${telegramUserId}@telegram.lifecare.invalid`;
}

export function createSupabaseAttemptStore(client: SupabaseClient): AttemptStore {
  return {
    async purgeExpired(before) {
      const { error } = await client.from(TABLE).delete().lt('expires_at', before.toISOString());
      if (error) throw new Error(`purge: ${error.message}`);
    },

    async create(attempt) {
      const { error } = await client.from(TABLE).insert({
        state: attempt.state,
        app_redirect_uri: attempt.appRedirectUri,
        app_code_challenge: attempt.appCodeChallenge,
        telegram_code_verifier: attempt.telegramCodeVerifier,
        nonce: attempt.nonce,
        expires_at: attempt.expiresAt.toISOString(),
      });
      if (error) throw new Error(`create attempt: ${error.message}`);
    },

    async claimForCallback(state, now) {
      const { data, error } = await client
        .from(TABLE)
        .update({ completed_at: now.toISOString() })
        .eq('state', state)
        .is('completed_at', null)
        .gt('expires_at', now.toISOString())
        .select('app_redirect_uri, telegram_code_verifier, nonce')
        .maybeSingle();
      if (error) throw new Error(`claim attempt: ${error.message}`);
      return data ? { appRedirectUri: data.app_redirect_uri, telegramCodeVerifier: data.telegram_code_verifier, nonce: data.nonce } : null;
    },

    async finish(state, result) {
      const { error } = await client
        .from(TABLE)
        .update({
          app_code_hash: result.appCodeHash,
          token_hash: result.tokenHash,
          telegram_user_id: result.telegramUserId,
          expires_at: result.expiresAt.toISOString(),
        })
        .eq('state', state);
      if (error) throw new Error(`finish attempt: ${error.message}`);
    },

    async consume(appCodeHash, now) {
      const { data, error } = await client
        .from(TABLE)
        .delete()
        .eq('app_code_hash', appCodeHash)
        .not('token_hash', 'is', null)
        .gt('expires_at', now.toISOString())
        .select('app_code_challenge, token_hash')
        .maybeSingle();
      if (error) throw new Error(`consume attempt: ${error.message}`);
      return data ? { appCodeChallenge: data.app_code_challenge, tokenHash: data.token_hash } : null;
    },
  };
}

export function createSupabaseAccounts(client: SupabaseClient): Accounts {
  return {
    async issueLoginToken(identity: TelegramIdentity) {
      const metadata = {
        full_name: identity.name,
        telegram_id: identity.telegramUserId,
        telegram_username: identity.username,
        avatar_url: identity.picture,
      };
      // A magic link for an unknown address creates the user; for a known one it signs them in.
      const { data, error } = await client.auth.admin.generateLink({
        type: 'magiclink',
        email: telegramUserEmail(identity.telegramUserId),
        options: { data: metadata },
      });
      const hashedToken = data?.properties?.hashed_token;
      if (error || !data?.user || !hashedToken) throw new Error(`generate link: ${error?.message ?? 'empty response'}`);

      // Existing users keep their id; refresh the Telegram profile they see in the app.
      const { error: updateError } = await client.auth.admin.updateUserById(data.user.id, { user_metadata: metadata });
      if (updateError) throw new Error(`update user: ${updateError.message}`);

      const { error: profileError } = await client.from('lifecare_profiles').upsert({
        id: data.user.id,
        telegram_user_id: identity.telegramUserId,
        display_name: identity.name,
        updated_at: new Date().toISOString(),
      });
      if (profileError) throw new Error(`upsert profile: ${profileError.message}`);

      return hashedToken;
    },
  };
}

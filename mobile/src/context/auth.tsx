import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session, User } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/services/supabase';
import {
  createPkcePair,
  exchangeTelegramCode,
  parseTelegramCallback,
  TELEGRAM_AUTH_PATH,
  TelegramLoginError,
  telegramLoginErrorMessage,
  telegramLoginFunctionUrl,
  telegramLoginStartUrl,
} from '@/services/telegram-auth';

type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInWithTelegram: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

WebBrowser.maybeCompleteAuthSession();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    const auth = supabase.auth;
    let mounted = true;
    void auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data: subscription } = auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    // React Native has no page visibility events, so token refresh follows the app state.
    if (AppState.currentState === 'active') void auth.startAutoRefresh();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void auth.startAutoRefresh();
      else void auth.stopAutoRefresh();
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
      appState.remove();
      void auth.stopAutoRefresh();
    };
  }, []);

  const value = useMemo<AuthState>(() => ({
    configured: Boolean(supabase),
    loading,
    session,
    user: session?.user ?? null,
    async signInWithTelegram() {
      if (!supabase || !process.env.EXPO_PUBLIC_SUPABASE_URL) return { error: 'Облачное подключение пока не настроено.' };
      const functionUrl = telegramLoginFunctionUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
      const redirectTo = Linking.createURL(TELEGRAM_AUTH_PATH);
      try {
        const pkce = await createPkcePair({
          randomBytes: Crypto.getRandomBytes,
          sha256: (data) => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data),
        });
        const result = await WebBrowser.openAuthSessionAsync(telegramLoginStartUrl(functionUrl, redirectTo, pkce.challenge), redirectTo);
        if (result.type === 'cancel' || result.type === 'dismiss') return {};
        if (result.type !== 'success') return { error: telegramLoginErrorMessage('login_failed') };

        const callback = parseTelegramCallback(result.url);
        if ('error' in callback) return { error: telegramLoginErrorMessage(callback.error) };
        const tokenHash = await exchangeTelegramCode(functionUrl, callback.code, pkce.verifier);
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
        return error ? { error: 'Не удалось подтвердить вход. Попробуйте ещё раз.' } : {};
      } catch (error) {
        if (error instanceof TelegramLoginError) return { error: error.message };
        return { error: 'Не удалось открыть Telegram. Проверьте интернет и повторите попытку.' };
      }
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut();
    },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session, User } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/services/supabase';

type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInWithTelegram: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const telegramLoginUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/telegram-login`;

WebBrowser.maybeCompleteAuthSession();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => ({
    configured: Boolean(supabase),
    loading,
    session,
    user: session?.user ?? null,
    async signInWithTelegram() {
      if (!supabase) return { error: 'Облачное подключение пока не настроено.' };
      const redirectTo = Linking.createURL('auth/telegram');
      try {
        const result = await WebBrowser.openAuthSessionAsync(telegramLoginUrl, redirectTo);
        if (result.type === 'cancel' || result.type === 'dismiss') return {};
        if (result.type !== 'success') return { error: 'Не удалось завершить вход. Попробуйте ещё раз.' };

        const { queryParams } = Linking.parse(result.url);
        if (!queryParams) return { error: 'Сервис входа вернул неполный ответ. Попробуйте ещё раз.' };
        const tokenHash = queryParams.token_hash;
        const type = queryParams.type;
        if (typeof tokenHash !== 'string' || type !== 'email') {
          return { error: 'Сервис входа вернул неполный ответ. Попробуйте ещё раз.' };
        }
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
        return error ? { error: 'Не удалось подтвердить вход. Попробуйте ещё раз.' } : {};
      } catch {
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

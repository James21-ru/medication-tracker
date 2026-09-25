import 'expo-sqlite/localStorage/install';
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && publishableKey
  ? createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
    },
  })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error('Cloud backup is not configured. Add the Supabase public key to .env.');
  return supabase;
}

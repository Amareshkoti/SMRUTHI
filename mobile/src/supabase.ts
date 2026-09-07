import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The one Supabase client.
 *
 * The anon key below is compiled into the app bundle in plain text, and that is
 * fine -- it is meant to be published. What makes it safe is that every table
 * has row-level security scoped to auth.uid(), so this key alone can read
 * nothing. If a policy is ever wrong, this key is what an attacker uses.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabaseConfigured = Boolean(url && anonKey);

export const SUPABASE_SETUP_HINT =
  'This build has no Supabase settings. Copy mobile/.env.example to mobile/.env, ' +
  'fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart Expo.';

/**
 * Created even when unconfigured so the app can render a useful message rather
 * than crash on import. Every call will fail; `supabaseConfigured` is the guard.
 */
export const supabase: SupabaseClient = createClient(
  url || 'https://unconfigured.supabase.co',
  anonKey || 'unconfigured',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // There is no URL bar to read a session out of on a phone.
      detectSessionInUrl: false,
    },
  },
);

/** The current access token, for calls to our own API server. */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

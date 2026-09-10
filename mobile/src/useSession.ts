import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';

export interface SessionState {
  session: Session | null;
  userId: string | null;
  email: string | null;
  /** True until we know whether a stored session exists, so we do not flash the sign-in screen. */
  loading: boolean;
}

export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function handleAuthUrl(url: string | null) {
      if (!url || cancelled) return;
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        return;
      }
      const tokenHash = parsed.searchParams.get('token_hash');
      const type = parsed.searchParams.get('type') as 'signup' | 'recovery' | 'invite' | 'email_change' | null;
      if (tokenHash && type) await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    }

    void Linking.getInitialURL().then(handleAuthUrl).catch(() => undefined);
    const linking = Linking.addEventListener('url', ({ url }) => { void handleAuthUrl(url); });

    // A session may already be on the device from last time. Read it before
    // rendering anything, otherwise a returning user sees the sign-in screen
    // blink past on every launch.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setSession(data.session);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Covers sign-in, sign-out, and token refresh, including a refresh that
    // fails because the account was deleted server-side.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!cancelled) setSession(next);
    });

    return () => {
      cancelled = true;
      linking.remove();
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
    loading,
  };
}

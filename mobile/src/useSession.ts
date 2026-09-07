import { useEffect, useState } from 'react';
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

import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

/**
 * Who is calling.
 *
 * The rows themselves are guarded by Postgres row-level security, not by this
 * file -- the app talks to Supabase directly and RLS decides what it may see.
 * What this guards is the expensive part: /api/ingest and /api/ask each spend
 * real NVIDIA credits, and an unauthenticated endpoint is someone else's free
 * GPU. So we check the caller is a real signed-in user, and otherwise stay out
 * of the way.
 */
export interface AuthedRequest extends Request {
  userId?: string;
}

interface SupabaseUser {
  id: string;
  email?: string;
}

/** Ask Supabase whether this access token is real. */
async function userForToken(token: string): Promise<SupabaseUser | null> {
  if (!config.supabaseUrl || !config.supabaseServiceKey) return null;
  try {
    const res = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      signal: AbortSignal.timeout(config.authTimeoutMs),
      headers: {
        Authorization: `Bearer ${token}`,
        // Supabase requires an apikey header even when a bearer token is present.
        apikey: config.supabaseServiceKey,
      },
    });
    if (res.status >= 500) throw new Error('Authentication service unavailable');
    if (!res.ok) return null;
    const user = (await res.json()) as SupabaseUser;
    return user?.id ? user : null;
  } catch {
    throw new Error('Authentication service unavailable');
  }
}

export async function requireUser(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Offline demo mode has no Supabase project behind it, so requiring a real
  // token would make the whole point of that mode -- surviving a dead venue --
  // impossible. It never touches anyone's data, so let it through.
  if (config.mock) {
    req.userId = 'offline-demo';
    next();
    return;
  }

  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    res.status(503).json({
      error: 'This server has no Supabase configuration, so it cannot verify who you are.',
    });
    return;
  }

  const header = req.header('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Please sign in again.' });
    return;
  }

  let user: SupabaseUser | null;
  try {
    user = await userForToken(token);
  } catch {
    res.status(503).json({ error: 'Sign-in verification is temporarily unavailable. Try again.' });
    return;
  }
  if (!user) {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return;
  }

  req.userId = user.id;
  next();
}

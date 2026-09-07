import Constants from 'expo-constants';
import type { Fact, Insight, IngestedDocument, Language, ChatTurn } from '../../shared/contracts';
export type { Fact, Insight, IngestedDocument, Language, ChatTurn, TrendPoint } from '../../shared/contracts';
export { formatWarning, isSafeWarningMessage } from '../../shared/messages';
import { DEFAULT_API_PORT, MAX_HISTORY } from '../../shared/contracts';
import { accessToken } from './supabase';

/**
 * The phone cannot reach "localhost" -- that is the phone itself. Expo already
 * knows the dev machine's LAN address (it is how the bundle was served), so we
 * reuse that host and swap in the server port. Overridable for a deployed server.
 */
function defaultBase(): string {
  const override = process.env.EXPO_PUBLIC_SMRUTI_API;
  if (override) return override.replace(/\/+$/, '');
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? '';
  const port = process.env.EXPO_PUBLIC_API_PORT ?? String(DEFAULT_API_PORT);
  const host = hostUri ? new URL(`http://${hostUri}`).hostname : (typeof window !== 'undefined' ? window.location.hostname : '');
  if (!host && !__DEV__) throw new Error('EXPO_PUBLIC_SMRUTI_API is required in this build.');
  return `http://${host || 'localhost'}:${port}`;
}

export const API_BASE = defaultBase();

async function post<T>(path: string, body: unknown, timeoutMs = 300_000): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    // Every model-backed route is behind a signed-in user: these calls spend
    // real credits, and an open endpoint is someone else's free GPU.
    const token = await accessToken();
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const raw = await res.text();
    let json: T & { error?: string };
    try { json = JSON.parse(raw); } catch { throw new Error(`The server returned an unreadable response (HTTP ${res.status}).`); }
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('The server took too long to answer. Is it still running?');
    }
    if (err instanceof TypeError) {
      throw new Error(`Cannot reach the server at ${API_BASE}. Start it with "npm start" in the server folder.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: async () => {
    const res = await fetch(`${API_BASE}/api/health`);
    return res.json() as Promise<{ ok: boolean; mock: boolean }>;
  },
  /**
   * The file's bytes, base64'd. They are read once on the server and dropped --
   * there is no bucket and nothing is written to disk.
   */
  ingest: (file: { fileBase64: string; mimeType: string; name: string }) =>
    post<{ documents: IngestedDocument[]; factCount: number }>('/api/ingest', file),
  insights: (facts: Fact[]) => post<{ insights: Insight[] }>('/api/insights', { facts }, 20_000),
  warning: (facts: Fact[], language: Language) =>
    post<{ insight: Insight | null; message: string | null }>('/api/warning', { facts, language }),
  ask: (question: string, facts: Fact[], language: Language, history: ChatTurn[] = []) =>
    post<{ answer: string; insights: Insight[] }>('/api/ask', { question, facts, language, history: history.slice(-MAX_HISTORY) }),
};

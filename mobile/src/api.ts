import Constants from 'expo-constants';

/**
 * The phone cannot reach "localhost" -- that is the phone itself. Expo already
 * knows the dev machine's LAN address (it is how the bundle was served), so we
 * reuse that host and swap in the server port. Overridable for a deployed server.
 */
function defaultBase(): string {
  const override = process.env.EXPO_PUBLIC_SMRUTI_API;
  if (override) return override;
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? '';
  const host = hostUri.split(':')[0];
  return host ? `http://${host}:8787` : 'http://localhost:8787';
}

export const API_BASE = defaultBase();

export type Language = 'en' | 'hi' | 'te';

export interface Fact {
  date: string;
  analyte: string;
  analyteAsPrinted: string;
  value: number;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  doctor: string;
  hospital: string;
  /** Local-only: which stored document this came from. Never sent by the server. */
  docId?: string;
}

export interface TrendPoint {
  date: string;
  value: number;
  unit: string;
  hospital: string;
  normalOnItsOwnReport: boolean;
}

export interface Insight {
  analyte: string;
  unit: string;
  severity: 'none' | 'info' | 'warning';
  direction: 'rising' | 'falling' | 'flat';
  points: TrendPoint[];
  slopePerYear: number;
  firstValue: number;
  lastValue: number;
  spanYears: number;
  everyReportLookedNormal: boolean;
  band: string | null;
  statement: string;
}

export interface IngestedDocument {
  documentTitle: string;
  documentDate: string;
  hospital: string;
  doctor: string;
  facts: Fact[];
  sourceId: string;
  sourceName: string;
  pages: number;
  ms: number;
}

async function post<T>(path: string, body: unknown, timeoutMs = 300_000): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const json = (await res.json()) as T & { error?: string };
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
    return res.json() as Promise<{ ok: boolean; mock: boolean; keyConfigured: boolean }>;
  },
  ingest: (link: string) => post<{ documents: IngestedDocument[]; factCount: number }>('/api/ingest', { link }),
  insights: (facts: Fact[]) => post<{ insights: Insight[] }>('/api/insights', { facts }, 20_000),
  warning: (facts: Fact[], language: Language) =>
    post<{ insight: Insight | null; message: string | null }>('/api/warning', { facts, language }),
  ask: (question: string, facts: Fact[], language: Language) =>
    post<{ answer: string; insights: Insight[] }>('/api/ask', { question, facts, language }),
};

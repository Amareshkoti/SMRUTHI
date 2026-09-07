import 'dotenv/config';
import { DEFAULT_API_PORT } from '../../shared/contracts.js';

/** Every NVIDIA credential in this project is read here and nowhere else. */
export const config = {
  nvidiaApiKey: process.env.NVIDIA_API_KEY ?? '',
  /** Used only to check a caller's access token is real. Never sent to a model. */
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/+$/, ''),
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  port: Number(process.env.PORT ?? DEFAULT_API_PORT),
  /** Offline demo mode: serve fixtures instead of calling NVIDIA. */
  mock: process.env.SMRUTI_MOCK === '1',
  nimBaseUrl: (process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, ''),
  maxPdfPages: Number(process.env.MAX_PDF_PAGES ?? 10),
  authTimeoutMs: Number(process.env.AUTH_TIMEOUT_MS ?? 10000),
  allowedOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  models: {
    /** Stage 1: document image -> markdown + tables. */
    parse: process.env.NIM_PARSE_MODEL ?? 'nvidia/nemotron-parse',
    /** Stage 2: markdown -> strict typed JSON facts. */
    extract: process.env.NIM_EXTRACT_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
    /** Stage 3a: English/Hindi answering. */
    answer: process.env.NIM_ANSWER_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
    /**
     * Stage 3b: Telugu answering.
     * Deliberately NOT nemotron-3-super: in testing it mixed Devanagari and
     * romanised words into Telugu output, degenerated into token repetition,
     * and inverted "rising" into "improving" -- a medically dangerous error.
     * Ultra produced correct, clean Telugu.
     */
    answerTelugu: process.env.NIM_TELUGU_MODEL ?? 'nvidia/nemotron-3-ultra-550b-a55b',
    /** Hindi translation fallback. Supports 37 languages; Telugu is NOT one. */
    translate: 'nvidia/riva-translate-4b-instruct-v2',
  },
} as const;

export type Language = 'en' | 'hi' | 'te';

export function assertConfigured(): void {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT must be between 1 and 65535.');
  if (!Number.isInteger(config.maxPdfPages) || config.maxPdfPages < 1 || config.maxPdfPages > 100) throw new Error('MAX_PDF_PAGES must be between 1 and 100.');
  if (!Number.isFinite(config.authTimeoutMs) || config.authTimeoutMs < 1) throw new Error('AUTH_TIMEOUT_MS must be positive.');
  if (!config.mock && (!config.supabaseUrl || !config.supabaseServiceKey)) throw new Error('Supabase authentication settings are missing.');
  if (config.mock && process.env.NODE_ENV === 'production') throw new Error('Demo mode cannot run in production.');
  if (process.env.NODE_ENV === 'production' && !config.allowedOrigins.length) throw new Error('Configure CORS_ORIGINS for production.');
  if (!config.mock && !config.nvidiaApiKey) {
    throw new Error(
      'NVIDIA_API_KEY is not set. Copy server/.env.example to server/.env and add your key ' +
        'from https://build.nvidia.com, or set SMRUTI_MOCK=1 to run offline.',
    );
  }
}

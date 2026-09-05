import 'dotenv/config';

/** Every NVIDIA credential in this project is read here and nowhere else. */
export const config = {
  nvidiaApiKey: process.env.NVIDIA_API_KEY ?? '',
  googleApiKey: process.env.GOOGLE_API_KEY ?? '',
  port: Number(process.env.PORT ?? 8787),
  /** Offline demo mode: serve fixtures instead of calling NVIDIA. */
  mock: process.env.SMRUTI_MOCK === '1',
  nimBaseUrl: 'https://integrate.api.nvidia.com/v1',
  models: {
    /** Stage 1: document image -> markdown + tables. */
    parse: 'nvidia/nemotron-parse',
    /** Stage 2: markdown -> strict typed JSON facts. */
    extract: 'nvidia/nemotron-3-super-120b-a12b',
    /** Stage 3a: English/Hindi answering. */
    answer: 'nvidia/nemotron-3-super-120b-a12b',
    /**
     * Stage 3b: Telugu answering.
     * Deliberately NOT nemotron-3-super: in testing it mixed Devanagari and
     * romanised words into Telugu output, degenerated into token repetition,
     * and inverted "rising" into "improving" -- a medically dangerous error.
     * Ultra produced correct, clean Telugu.
     */
    answerTelugu: 'nvidia/nemotron-3-ultra-550b-a55b',
    /** Hindi translation fallback. Supports 37 languages; Telugu is NOT one. */
    translate: 'nvidia/riva-translate-4b-instruct-v2',
  },
} as const;

export type Language = 'en' | 'hi' | 'te';

export function assertConfigured(): void {
  if (!config.mock && !config.nvidiaApiKey) {
    throw new Error(
      'NVIDIA_API_KEY is not set. Copy server/.env.example to server/.env and add your key ' +
        'from https://build.nvidia.com, or set SMRUTI_MOCK=1 to run offline.',
    );
  }
}

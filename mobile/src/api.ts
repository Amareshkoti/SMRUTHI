import type { Fact, Language, ChatTurn } from '../../shared/contracts';
export type { Fact, Insight, IngestedDocument, Language, ChatTurn, TrendPoint } from '../../shared/contracts';
export { formatWarning, isSafeWarningMessage } from '../../shared/messages';
import { formatWarning } from '../../shared/messages';
import { detectLocalTrends } from './trendAnalysis';
import { answerQuestion } from './ai/answer';
import { ingestReport } from './ai/ingest';
import { config } from './ai/config';
export type { FaceDiagnosisResult, FaceZoneObservation } from './faceDiagnosis';

// The phone orchestrates these operations directly. There is no LAN API.
export const API_BASE = config.nimBaseUrl;
export const api = {
  health: async () => ({ ok: Boolean(config.nvidiaApiKey), mock: false }),
  ingest: ingestReport,
  insights: async (facts: Fact[]) => ({ insights: detectLocalTrends(facts) }),
  warning: async (facts: Fact[], language: Language) => {
    const insight = detectLocalTrends(facts).find(i => i.severity === 'warning') ?? null;
    return { insight, message: insight ? formatWarning(insight, language) : null };
  },
  ask: async (question: string, facts: Fact[], language: Language, history: ChatTurn[] = []) => {
    const insights = detectLocalTrends(facts);
    return { insights, answer: await answerQuestion({ question, facts, insights, language, history }) };
  },
  faceDiagnosis: async (base64Image: string, language: Language) => {
    const { analyzeFaceStructured } = await import('./faceDiagnosis');
    // We do this off the main thread or simply await since it takes a moment
    return new Promise<import('./faceDiagnosis').FaceDiagnosisResult | null>((resolve) => {
      setTimeout(() => {
        resolve(analyzeFaceStructured(base64Image, language));
      }, 50);
    });
  },
};

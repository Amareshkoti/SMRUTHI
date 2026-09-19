import type { Fact } from './api';
import type { FaceDiagnosisResult } from './faceDiagnosis';

/**
 * Context for a one-off Ask conversation about an on-device screening (camera
 * pulse checkup, face reading). Never written to chatStorage or the SQLite
 * cache -- it lives only in React state for as long as the Ask screen is
 * mounted, and disappears with it.
 */
export interface EphemeralChatContext {
  label: string;
  facts: Fact[];
  extraContext?: string;
}

export function describeFaceDiagnosis(result: FaceDiagnosisResult): string {
  const lines = [
    `Overall complexion: ${result.overall.description} (RGB ${result.overall.r}/${result.overall.g}/${result.overall.b}, ` +
      `lightness ${result.overall.lightnessPercent}%, image suitability ${result.overall.suitability})`,
    result.patternFlags.length
      ? `Traditional pattern flags: ${result.patternFlags.join('; ')}`
      : 'No traditional pattern flag was strongly triggered.',
    ...result.zones.map(
      (z) => `${z.label} zone (${z.association}): ${z.observation} (RGB ${z.r}/${z.g}/${z.b}, lightness ${z.lightnessPercent}%)`,
    ),
  ];
  return lines.join('\n');
}

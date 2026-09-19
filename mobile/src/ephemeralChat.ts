import type { AskMode, Fact, PrescriptionExtraction } from './api';
import type { FaceDiagnosisResult } from './faceDiagnosis';

/**
 * Context for a one-off Ask conversation about an on-device screening (camera
 * pulse checkup, face reading, prescription photo). Never written to
 * chatStorage or the SQLite cache -- it lives only in React state for as long
 * as the Ask screen is mounted, and disappears with it.
 */
export interface EphemeralChatContext {
  label: string;
  facts: Fact[];
  extraContext?: string;
  /** Selects which system prompt Ask uses. Defaults to 'records'. */
  mode?: AskMode;
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

export function describePrescription(result: PrescriptionExtraction): string {
  const header = [
    result.doctor ? `Doctor: ${result.doctor}` : null,
    result.hospital ? `Hospital/clinic: ${result.hospital}` : null,
    result.documentDate ? `Date: ${result.documentDate}` : null,
  ].filter(Boolean).join(' · ');
  const lines = result.medicines.map((m) => {
    const parts = [m.name, m.strength, m.frequency, m.duration].filter(Boolean).join(', ');
    const extra = [m.instructions, m.commonUse].filter(Boolean).join(' -- ');
    return `- ${parts}${extra ? ` (${extra})` : ''}`;
  });
  return [header, ...lines].filter(Boolean).join('\n');
}

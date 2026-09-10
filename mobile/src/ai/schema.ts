import { z } from 'zod';
import { MAX_FACTS, validDate } from '../../../shared/contracts';

const text = z.string().trim().max(500);
export const DateSchema = z.string().refine(validDate, 'Use a real calendar date in YYYY-MM-DD format');
export const HealthFactSchema = z.object({
  date: DateSchema,
  analyte: text.min(1),
  analyteAsPrinted: text.default(''),
  value: z.number().finite(),
  unit: z.string().trim().max(80).default(''),
  refLow: z.number().finite().nullable().default(null),
  refHigh: z.number().finite().nullable().default(null),
  refLowInclusive: z.boolean().optional(),
  refHighInclusive: z.boolean().optional(),
  doctor: text.default(''),
  hospital: text.default(''),
}).refine(f => f.refLow === null || f.refHigh === null || f.refLow <= f.refHigh, 'Reference limits are reversed');
export type HealthFact = z.infer<typeof HealthFactSchema>;
export const ExtractionSchema = z.object({
  isMedicalReport: z.boolean(),
  medicalEvidence: z.string().trim().max(1000),
  documentTitle: text.default(''),
  documentDate: z.union([DateSchema, z.literal('')]).default(''),
  hospital: text.default(''),
  doctor: text.default(''),
  facts: z.array(HealthFactSchema).max(MAX_FACTS),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/** Formatting only: no supported-test list or guessed synonyms. */
export function canonicaliseAnalyte(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
export function normaliseExtraction(e: Extraction): Extraction {
  return { ...e, facts: e.facts.map(f => ({ ...f,
    analyteAsPrinted: f.analyteAsPrinted || f.analyte,
    analyte: canonicaliseAnalyte(f.analyte),
    hospital: f.hospital || e.hospital, doctor: f.doctor || e.doctor })) };
}

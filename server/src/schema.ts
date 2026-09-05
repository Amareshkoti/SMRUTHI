import { z } from 'zod';

/**
 * One measured fact pulled out of one document.
 * This is the unit the whole product is built on: a 4 MB scan collapses to a
 * handful of these, and nothing else about the document is kept.
 */
export const HealthFactSchema = z.object({
  /** ISO date the sample was taken / the document was issued. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  /** Canonical test name, e.g. "HbA1c". */
  analyte: z.string().min(1),
  /** Name exactly as printed on the report, e.g. "Glycated Haemoglobin". */
  analyteAsPrinted: z.string().default(''),
  value: z.number(),
  unit: z.string().default(''),
  refLow: z.number().nullable().default(null),
  refHigh: z.number().nullable().default(null),
  doctor: z.string().default(''),
  hospital: z.string().default(''),
});
export type HealthFact = z.infer<typeof HealthFactSchema>;

export const ExtractionSchema = z.object({
  documentTitle: z.string().default(''),
  documentDate: z.string().default(''),
  hospital: z.string().default(''),
  doctor: z.string().default(''),
  facts: z.array(HealthFactSchema),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/**
 * Aliases seen on Indian lab reports. Stage 2 is told to canonicalise, but we
 * normalise again here so a model slip cannot fragment one series into three.
 */
const ALIASES: Record<string, string> = {
  hba1c: 'HbA1c',
  'hb a1c': 'HbA1c',
  a1c: 'HbA1c',
  'glycated haemoglobin': 'HbA1c',
  'glycated hemoglobin': 'HbA1c',
  'glycosylated haemoglobin': 'HbA1c',
  'haemoglobin a1c': 'HbA1c',
  'fasting blood sugar': 'Fasting Glucose',
  'fasting blood glucose': 'Fasting Glucose',
  fbs: 'Fasting Glucose',
  'post prandial blood sugar': 'Postprandial Glucose',
  ppbs: 'Postprandial Glucose',
  'total cholesterol': 'Total Cholesterol',
  'serum creatinine': 'Creatinine',
  creatinine: 'Creatinine',
  haemoglobin: 'Haemoglobin',
  hemoglobin: 'Haemoglobin',
  hb: 'Haemoglobin',
  tsh: 'TSH',
};

export function canonicaliseAnalyte(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.()]/g, '');
  return ALIASES[key] ?? name.trim();
}

export function normaliseExtraction(e: Extraction): Extraction {
  return {
    ...e,
    facts: e.facts.map((f) => ({
      ...f,
      analyteAsPrinted: f.analyteAsPrinted || f.analyte,
      analyte: canonicaliseAnalyte(f.analyte),
      hospital: f.hospital || e.hospital,
      doctor: f.doctor || e.doctor,
    })),
  };
}

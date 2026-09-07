/** Shared transport and algorithm settings. No clinical lookup tables. */
export type Language = 'en' | 'hi' | 'te';
export const LANGUAGES = ['en', 'hi', 'te'] as const;
export const MAX_UPLOAD_BYTES = 18 * 1024 * 1024;
export const ACCEPTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const MIN_TREND_DATES = 3;
export const MAX_FACTS = 5000;
export const MAX_HISTORY = 8;
export const MAX_QUESTION_CHARS = 4000;
export const DEFAULT_API_PORT = 8787;
export interface Fact {
  date: string;
  analyte: string;
  analyteAsPrinted: string;
  value: number;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  refLowInclusive?: boolean;
  refHighInclusive?: boolean;
  doctor: string;
  hospital: string;
  docId?: string;
}
export type RangeStatus = 'below' | 'within' | 'above' | 'unknown';
export interface TrendPoint extends Omit<Fact, 'analyte' | 'analyteAsPrinted' | 'doctor'> {
  rangeStatus: RangeStatus;
  normalOnItsOwnReport: boolean | null;
}
export interface Insight {
  id: string;
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
  excludedDates: number;
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
export interface ChatTurn { role: 'user' | 'assistant'; text: string }
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}
/** Formatting normalization only; unknown names and different units stay separate. */
export function measurementKey(name: string, unit: string): string {
  return JSON.stringify([name.trim().replace(/\s+/g, ' ').toLowerCase(), unit.trim().replace(/\s+/g, '')]);
}
export function rangeStatus(f: Pick<Fact, 'value' | 'refLow' | 'refHigh' | 'refLowInclusive' | 'refHighInclusive'>): RangeStatus {
  if (f.refLow === null && f.refHigh === null) return 'unknown';
  if (f.refLow !== null && (f.value < f.refLow || (f.refLowInclusive === false && f.value === f.refLow))) return 'below';
  if (f.refHigh !== null && (f.value > f.refHigh || (f.refHighInclusive === false && f.value === f.refHigh))) return 'above';
  return 'within';
}

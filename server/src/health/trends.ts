import type { HealthFact } from '../schema.js';

export type Severity = 'none' | 'info' | 'warning';

export interface TrendPoint {
  date: string;
  value: number;
  unit: string;
  hospital: string;
  /** True when this value sat inside the reference range printed on ITS OWN report. */
  normalOnItsOwnReport: boolean;
}

export interface Insight {
  analyte: string;
  unit: string;
  severity: Severity;
  direction: 'rising' | 'falling' | 'flat';
  points: TrendPoint[];
  /** Least-squares slope in units per year. */
  slopePerYear: number;
  firstValue: number;
  lastValue: number;
  spanYears: number;
  /**
   * The whole product in one boolean: every individual report read "normal",
   * yet the series moved consistently in a harmful direction.
   */
  everyReportLookedNormal: boolean;
  /** Clinical band the latest value now sits in, when we know the analyte. */
  band: string | null;
  /** Neutral, factual English. The LLM rephrases this; it never invents it. */
  statement: string;
}

/** Clinical bands we are confident about. Deliberately few. */
const BANDS: Record<string, { unit: string; bands: { max: number; label: string }[] }> = {
  HbA1c: {
    unit: '%',
    bands: [
      { max: 5.7, label: 'normal' },
      { max: 6.5, label: 'pre-diabetic range' },
      { max: Infinity, label: 'diabetic range' },
    ],
  },
  'Fasting Glucose': {
    unit: 'mg/dL',
    bands: [
      { max: 100, label: 'normal' },
      { max: 126, label: 'pre-diabetic range' },
      { max: Infinity, label: 'diabetic range' },
    ],
  },
};

/** Analytes where a rise is the harmful direction. */
const RISING_IS_BAD = new Set([
  'HbA1c',
  'Fasting Glucose',
  'Postprandial Glucose',
  'Total Cholesterol',
  'Creatinine',
  'TSH',
]);

function bandFor(analyte: string, value: number): string | null {
  const spec = BANDS[analyte];
  if (!spec) return null;
  for (const b of spec.bands) if (value < b.max) return b.label;
  return null;
}

function yearsBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / (365.25 * 24 * 3600 * 1000);
}

/** Least-squares slope of value against time in years. */
function slopePerYear(points: TrendPoint[]): number {
  const t0 = points[0]!.date;
  const xs = points.map((p) => yearsBetween(t0, p.date));
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

const MIN_POINTS = 3;

/**
 * Find series that move consistently in a harmful direction.
 *
 * This is intentionally plain arithmetic. The early-warning claim in the
 * pitch must be reproducible and auditable; a language model is never asked
 * whether the user is at risk, only to restate what this function computed.
 */
export function detectTrends(facts: HealthFact[]): Insight[] {
  const byAnalyte = new Map<string, HealthFact[]>();
  for (const f of facts) {
    const list = byAnalyte.get(f.analyte) ?? [];
    list.push(f);
    byAnalyte.set(f.analyte, list);
  }

  const insights: Insight[] = [];

  for (const [analyte, rawGroup] of byAnalyte) {
    const group = [...rawGroup].sort((a, b) => a.date.localeCompare(b.date));
    if (group.length < MIN_POINTS) continue;

    const points: TrendPoint[] = group.map((f) => ({
      date: f.date,
      value: f.value,
      unit: f.unit,
      hospital: f.hospital,
      normalOnItsOwnReport:
        f.refHigh === null ? true : f.value <= f.refHigh && (f.refLow === null || f.value >= f.refLow),
    }));

    const first = points[0]!;
    const last = points[points.length - 1]!;
    const strictlyRising = points.every((p, i) => i === 0 || p.value > points[i - 1]!.value);
    const strictlyFalling = points.every((p, i) => i === 0 || p.value < points[i - 1]!.value);
    const direction: Insight['direction'] = strictlyRising
      ? 'rising'
      : strictlyFalling
        ? 'falling'
        : 'flat';

    if (direction === 'flat') continue;

    const harmful = RISING_IS_BAD.has(analyte) ? direction === 'rising' : direction === 'falling';
    if (!harmful) continue;

    const everyReportLookedNormal = points.every((p) => p.normalOnItsOwnReport);
    const band = bandFor(analyte, last.value);
    const spanYears = yearsBetween(first.date, last.date);

    // A silent drift -- all-clear on every individual report, yet moving --
    // is exactly the case no clinician sees. Escalate it.
    const severity: Severity =
      everyReportLookedNormal || (band !== null && band !== 'normal') ? 'warning' : 'info';

    const statement =
      `${analyte} ${direction === 'rising' ? 'rose' : 'fell'} at every one of ` +
      `${points.length} measurements, from ${first.value}${first.unit} in ` +
      `${first.date.slice(0, 4)} to ${last.value}${last.unit} in ${last.date.slice(0, 4)}` +
      (band ? `, now in the ${band}` : '') +
      (everyReportLookedNormal
        ? '. Every one of those reports was within its own reference range, so no single report raised an alarm.'
        : '.');

    insights.push({
      analyte,
      unit: last.unit,
      severity,
      direction,
      points,
      slopePerYear: slopePerYear(points),
      firstValue: first.value,
      lastValue: last.value,
      spanYears,
      everyReportLookedNormal,
      band,
      statement,
    });
  }

  const rank: Record<Severity, number> = { warning: 0, info: 1, none: 2 };
  return insights.sort((a, b) => rank[a.severity] - rank[b.severity] || b.spanYears - a.spanYears);
}

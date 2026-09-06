/**
 * Client-side display constants for chart annotations. These never feed the
 * trend detector itself (that's server/src/health/trends.ts, kept in step
 * with this list) -- they only decide what a chart draws.
 */
export const THRESHOLDS: Record<string, number> = {
  HbA1c: 6.5,
  'Fasting Glucose': 126,
  'Total Cholesterol': 200,
};

export const THR_TEXT: Record<string, string> = {
  HbA1c: '6.5 % is the diabetes line',
  'Fasting Glucose': '126 mg/dL is the diabetes line',
  'Total Cholesterol': '200 mg/dL is the high line',
};

export const THR_SHORT: Record<string, string> = {
  HbA1c: 'diabetes 6.5',
  'Fasting Glucose': 'diabetes 126',
  'Total Cholesterol': 'high 200',
};

/** Printed-normal-range band drawn behind the line. [low, high]; null = no floor/ceiling. */
export const REFS: Record<string, [number | null, number | null]> = {
  HbA1c: [4.0, 6.5],
  'Fasting Glucose': [70, 110],
  'Total Cholesterol': [null, 200],
};

export function fmt(n: number): string {
  return Math.abs(n) < 1 ? n.toFixed(2) : n.toFixed(1);
}

/**
 * Years until the series crosses a clinical threshold at its current rate.
 * Only meaningful while it's rising toward a threshold it hasn't reached yet
 * -- matches how the trend detector already reasons about "harmful direction".
 */
export function yearsToThreshold(lastValue: number, slopePerYear: number, threshold: number | undefined): number | null {
  if (threshold === undefined) return null;
  if (slopePerYear <= 0) return null;
  if (lastValue >= threshold) return null;
  return (threshold - lastValue) / slopePerYear;
}

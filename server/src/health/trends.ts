import type { HealthFact } from '../schema.js';
import { measurementKey, MIN_TREND_DATES, rangeStatus, validDate, type Insight, type TrendPoint } from '../../../shared/contracts.js';
export type { Insight, TrendPoint } from '../../../shared/contracts.js';
export type Severity = Insight['severity'];
const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/** Analyze any numeric measurement. Interpretation uses only its printed ranges. */
export function detectTrends(facts: HealthFact[]): Insight[] {
  const groups = new Map<string, HealthFact[]>();
  for (const f of facts) {
    if (!validDate(f.date) || !Number.isFinite(f.value) || !f.analyte.trim()) continue;
    const id = measurementKey(f.analyte, f.unit);
    const group = groups.get(id) ?? [];
    group.push(f);
    groups.set(id, group);
  }
  const insights: Insight[] = [];
  for (const [id, raw] of groups) {
    const byDate = new Map<string, HealthFact[]>();
    for (const f of raw) byDate.set(f.date, [...(byDate.get(f.date) ?? []), f]);
    let excludedDates = 0;
    const unique: HealthFact[] = [];
    for (const readings of byDate.values()) {
      const first = readings[0]!;
      // Conflicting same-day readings have no known temporal order.
      if (readings.some(f => f.value !== first.value || f.refLow !== first.refLow || f.refHigh !== first.refHigh || (f.refLowInclusive ?? true) !== (first.refLowInclusive ?? true) || (f.refHighInclusive ?? true) !== (first.refHighInclusive ?? true))) {
        excludedDates++;
      } else unique.push(first);
    }
    unique.sort((a, b) => a.date.localeCompare(b.date));
    if (unique.length < MIN_TREND_DATES) continue;
    const points: TrendPoint[] = unique.map(f => {
      const status = rangeStatus(f);
      return { ...f, rangeStatus: status, normalOnItsOwnReport: status === 'unknown' ? null : status === 'within' };
    });
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const xs = points.map(p => (Date.parse(p.date) - Date.parse(first.date)) / YEAR_MS);
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = points.reduce((a, p) => a + p.value, 0) / points.length;
    const denominator = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
    const slope = points.reduce((a, p, n) => a + (xs[n]! - meanX) * (p.value - meanY), 0) / denominator;
    if (!Number.isFinite(slope)) continue;
    const tolerance = Math.max(1, ...points.map(p => Math.abs(p.value))) * 1e-10;
    const direction = Math.abs(slope) <= tolerance ? 'flat' : slope > 0 ? 'rising' : 'falling';
    const outside = last.rangeStatus === 'above' || last.rangeStatus === 'below';
    // A flat series is not a trend card. It remains available in the raw facts.
    if (direction === 'flat') continue;
    const severity = outside ? 'warning' : 'info';
    const analyte = unique[0]!.analyte;
    const statement = `${analyte} has an overall ${direction} trend across ${points.length} distinct dates, from ${first.value} ${first.unit} on ${first.date} to ${last.value} ${last.unit} on ${last.date}.`;
    insights.push({ id, analyte, unit: last.unit, severity, direction, points, slopePerYear: slope,
      firstValue: first.value, lastValue: last.value, spanYears: xs[xs.length - 1]!,
      everyReportLookedNormal: points.every(p => p.rangeStatus === 'within'),
      band: outside ? `${last.rangeStatus} report range` : null, statement, excludedDates });
  }
  const rank = { warning: 0, info: 1, none: 2 };
  return insights.sort((a, b) => rank[a.severity] - rank[b.severity] || b.spanYears - a.spanYears || a.id.localeCompare(b.id));
}

import { measurementKey, MIN_TREND_DATES, rangeStatus, validDate, type Fact, type Insight, type TrendPoint } from '../../shared/contracts';

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/** Local fallback so uploaded facts still produce trends if the API is offline. */
export function detectLocalTrends(facts: Fact[]): Insight[] {
  const groups = new Map<string, Fact[]>();
  for (const fact of facts) {
    if (!validDate(fact.date) || !Number.isFinite(fact.value) || !fact.analyte.trim()) continue;
    const group = groups.get(measurementKey(fact.analyte, fact.unit)) ?? [];
    group.push(fact);
    groups.set(measurementKey(fact.analyte, fact.unit), group);
  }
  const insights: Insight[] = [];
  for (const [id, raw] of groups) {
    const dates = new Map<string, Fact[]>();
    for (const fact of raw) dates.set(fact.date, [...(dates.get(fact.date) ?? []), fact]);
    const pointsByDate: Fact[] = [];
    let excludedDates = 0;
    for (const readings of dates.values()) {
      const first = readings[0]!;
      const conflict = readings.some((fact) => fact.value !== first.value || fact.refLow !== first.refLow || fact.refHigh !== first.refHigh);
      if (conflict) excludedDates++;
      else pointsByDate.push(first);
    }
    pointsByDate.sort((a, b) => a.date.localeCompare(b.date));
    if (pointsByDate.length < MIN_TREND_DATES) continue;
    const points: TrendPoint[] = pointsByDate.map((fact) => {
      const status = rangeStatus(fact);
      return { ...fact, rangeStatus: status, normalOnItsOwnReport: status === 'unknown' ? null : status === 'within' };
    });
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const xs = points.map((point) => (Date.parse(point.date) - Date.parse(first.date)) / YEAR_MS);
    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const meanY = points.reduce((sum, point) => sum + point.value, 0) / points.length;
    const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
    const slope = points.reduce((sum, point, index) => sum + (xs[index]! - meanX) * (point.value - meanY), 0) / denominator;
    if (!Number.isFinite(slope)) continue;
    const tolerance = Math.max(1, ...points.map((point) => Math.abs(point.value))) * 1e-10;
    const direction = Math.abs(slope) <= tolerance ? 'flat' : slope > 0 ? 'rising' : 'falling';
    if (direction === 'flat') continue;
    const outside = last.rangeStatus === 'above' || last.rangeStatus === 'below';
    insights.push({
      id, analyte: pointsByDate[0]!.analyte, unit: last.unit, severity: outside ? 'warning' : 'info', direction, points,
      slopePerYear: slope, firstValue: first.value, lastValue: last.value, spanYears: xs[xs.length - 1]!,
      everyReportLookedNormal: points.every((point) => point.rangeStatus === 'within'),
      band: outside ? `${last.rangeStatus} report range` : null,
      statement: `${pointsByDate[0]!.analyte} has an overall ${direction} trend across ${points.length} distinct dates, from ${first.value} ${first.unit} on ${first.date} to ${last.value} ${last.unit} on ${last.date}.`,
      excludedDates,
    });
  }
  const rank = { warning: 0, info: 1, none: 2 };
  return insights.sort((a, b) => rank[a.severity] - rank[b.severity] || b.spanYears - a.spanYears || a.id.localeCompare(b.id));
}

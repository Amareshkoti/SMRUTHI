import { measurementKey, type Fact } from '../../shared/contracts';

// Independent of file name, scan bytes, extraction order, and cosmetic spacing.
export function recordIdentity(facts: Fact[]): string {
  return JSON.stringify(facts.map(f => JSON.stringify([
    f.date, measurementKey(f.analyte, f.unit), f.value,
    f.refLow, f.refHigh, f.refLowInclusive ?? true, f.refHighInclusive ?? true,
    f.hospital.trim().toLowerCase().replace(/\s+/g, ' '),
  ])).sort());
}

import { describe, it, expect } from 'vitest';
import { detectTrends } from '../src/health/trends.js';
import type { HealthFact } from '../src/schema.js';

const fact = (o: Partial<HealthFact> & { date: string; value: number }): HealthFact => ({
  analyte: 'HbA1c',
  analyteAsPrinted: 'HbA1c',
  unit: '%',
  refLow: 4.0,
  refHigh: 6.5,
  doctor: '',
  hospital: '',
  ...o,
});

/** The exact scenario from slide 7 of the pitch. */
const slideSeven: HealthFact[] = [
  fact({ date: '2021-03-11', value: 5.6, hospital: 'Apollo' }),
  fact({ date: '2022-04-02', value: 5.8, hospital: 'Yashoda' }),
  fact({ date: '2023-05-19', value: 6.0, hospital: 'KIMS' }),
  fact({ date: '2024-03-08', value: 6.2, hospital: 'Care' }),
  fact({ date: '2025-06-21', value: 6.4, hospital: 'Continental' }),
];

describe('detectTrends', () => {
  it('raises a warning for a series that is normal on every report but rising', () => {
    const [insight] = detectTrends(slideSeven);
    expect(insight).toBeDefined();
    expect(insight!.analyte).toBe('HbA1c');
    expect(insight!.severity).toBe('warning');
    expect(insight!.direction).toBe('rising');
    expect(insight!.everyReportLookedNormal).toBe(true);
  });

  it('reports the band the latest value has drifted into', () => {
    const [insight] = detectTrends(slideSeven);
    expect(insight!.band).toBe('pre-diabetic range');
  });

  it('computes a positive slope of roughly 0.2 per year', () => {
    const [insight] = detectTrends(slideSeven);
    expect(insight!.slopePerYear).toBeGreaterThan(0.15);
    expect(insight!.slopePerYear).toBeLessThan(0.25);
  });

  it('states that no single report raised an alarm', () => {
    const [insight] = detectTrends(slideSeven);
    expect(insight!.statement).toContain('no single report raised an alarm');
    expect(insight!.statement).toContain('5.6');
    expect(insight!.statement).toContain('6.4');
  });

  it('ignores a series with fewer than three measurements', () => {
    expect(detectTrends(slideSeven.slice(0, 2))).toEqual([]);
  });

  it('ignores a series that wobbles instead of moving consistently', () => {
    const wobbly = [
      fact({ date: '2021-01-01', value: 5.6 }),
      fact({ date: '2022-01-01', value: 6.1 }),
      fact({ date: '2023-01-01', value: 5.7 }),
      fact({ date: '2024-01-01', value: 6.0 }),
    ];
    expect(detectTrends(wobbly)).toEqual([]);
  });

  it('ignores a falling sugar series, because falling is not the harmful direction', () => {
    const improving = slideSeven.map((f, i) => ({ ...f, value: 6.4 - i * 0.2 }));
    expect(detectTrends(improving)).toEqual([]);
  });

  it('flags a falling haemoglobin series, where falling IS the harmful direction', () => {
    const anaemia = [
      fact({ date: '2021-01-01', analyte: 'Haemoglobin', value: 13.5, unit: 'g/dL', refLow: 13, refHigh: 17 }),
      fact({ date: '2022-01-01', analyte: 'Haemoglobin', value: 13.3, unit: 'g/dL', refLow: 13, refHigh: 17 }),
      fact({ date: '2023-01-01', analyte: 'Haemoglobin', value: 13.1, unit: 'g/dL', refLow: 13, refHigh: 17 }),
    ];
    // Falling haemoglobin is not in RISING_IS_BAD, so 'falling' is the harmful direction.
    const out = detectTrends(anaemia);
    expect(out).toHaveLength(1);
    expect(out[0]!.direction).toBe('falling');
  });

  it('sorts unsorted input by date before judging direction', () => {
    const shuffled = [slideSeven[3]!, slideSeven[0]!, slideSeven[4]!, slideSeven[1]!, slideSeven[2]!];
    const [insight] = detectTrends(shuffled);
    expect(insight!.direction).toBe('rising');
    expect(insight!.points.map((p) => p.value)).toEqual([5.6, 5.8, 6.0, 6.2, 6.4]);
  });

  it('keeps separate analytes in separate series', () => {
    const mixed = [...slideSeven, fact({ date: '2021-01-01', analyte: 'TSH', value: 2.0, unit: 'mIU/L' })];
    const out = detectTrends(mixed);
    expect(out.map((i) => i.analyte)).toEqual(['HbA1c']);
  });
});

import { describe, it, expect } from 'vitest';
import { detectTrends } from '../src/health/trends.js';
import type { HealthFact } from '../src/schema.js';

const fact = (o: Partial<HealthFact> & { date: string; value: number }): HealthFact => ({
  analyte: 'Measure printed by the lab', analyteAsPrinted: 'Measure printed by the lab', unit: 'u',
  refLow: 0, refHigh: 100, doctor: '', hospital: '', ...o,
});

describe('detectTrends', () => {
  it('finds a rising trend from uploaded facts and uses the printed range', () => {
    const [insight] = detectTrends([
      fact({ date: '2021-01-01', value: 10 }), fact({ date: '2022-01-01', value: 20 }), fact({ date: '2023-01-01', value: 30 }),
    ]);
    expect(insight).toMatchObject({ analyte: 'Measure printed by the lab', direction: 'rising', severity: 'info', band: null });
    expect(insight!.points.map(p => p.value)).toEqual([10, 20, 30]);
  });

  it('warns only when the latest uploaded range says the value is outside', () => {
    const [insight] = detectTrends([
      fact({ date: '2021-01-01', value: 10, refHigh: 100 }), fact({ date: '2022-01-01', value: 60, refHigh: 100 }), fact({ date: '2023-01-01', value: 120, refHigh: 100 }),
    ]);
    expect(insight!.severity).toBe('warning');
    expect(insight!.band).toBe('above report range');
    expect(insight!.points.at(-1)!.rangeStatus).toBe('above');
  });

  it('keeps different names and units separate without aliases', () => {
    const out = detectTrends([
      fact({ analyte: 'A', unit: 'mg', date: '2021-01-01', value: 1 }), fact({ analyte: 'A', unit: 'mg', date: '2022-01-01', value: 2 }), fact({ analyte: 'A', unit: 'mg', date: '2023-01-01', value: 3 }),
      fact({ analyte: 'A', unit: 'g', date: '2021-01-01', value: 1 }), fact({ analyte: 'A', unit: 'g', date: '2022-01-01', value: 2 }), fact({ analyte: 'A', unit: 'g', date: '2023-01-01', value: 3 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('requires three distinct dates and ignores conflicting same-day readings', () => {
    expect(detectTrends([fact({ date: '2021-01-01', value: 1 }), fact({ date: '2022-01-01', value: 2 })])).toEqual([]);
    expect(detectTrends([
      fact({ date: '2021-01-01', value: 1 }), fact({ date: '2021-01-01', value: 2 }),
      fact({ date: '2022-01-01', value: 3 }), fact({ date: '2023-01-01', value: 4 }),
    ])).toEqual([]);
  });

  it('does not call a flat series a trend', () => {
    expect(detectTrends([fact({ date: '2021-01-01', value: 5 }), fact({ date: '2022-01-01', value: 5 }), fact({ date: '2023-01-01', value: 5 })])).toEqual([]);
  });
});

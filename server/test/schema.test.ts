import { describe, it, expect } from 'vitest';
import { canonicaliseAnalyte, normaliseExtraction, ExtractionSchema } from '../src/schema.js';

describe('analyte handling', () => {
  it('only normalises formatting and preserves unknown lab names', () => {
    expect(canonicaliseAnalyte('  Vitamin   B12  ')).toBe('Vitamin B12');
    expect(canonicaliseAnalyte('FBS')).toBe('FBS');
  });
});

describe('ExtractionSchema', () => {
  it('rejects string values and malformed or impossible dates', () => {
    expect(ExtractionSchema.safeParse({ facts: [{ date: '2021-03-11', analyte: 'Result', value: '5.6' }] }).success).toBe(false);
    expect(ExtractionSchema.safeParse({ facts: [{ date: '11/03/2021', analyte: 'Result', value: 5.6 }] }).success).toBe(false);
    expect(ExtractionSchema.safeParse({ facts: [{ date: '2021-02-30', analyte: 'Result', value: 5.6 }] }).success).toBe(false);
  });

  it('accepts a minimal valid fact and fills defaults', () => {
    const ok = ExtractionSchema.parse({ facts: [{ date: '2021-03-11', analyte: 'Result', value: 5.6 }] });
    expect(ok.facts[0]).toMatchObject({ unit: '', refLow: null, refHigh: null });
  });

  it('rejects reversed reference limits', () => {
    expect(ExtractionSchema.safeParse({ facts: [{ date: '2021-03-11', analyte: 'Result', value: 5.6, refLow: 10, refHigh: 1 }] }).success).toBe(false);
  });
});

describe('normaliseExtraction', () => {
  it('inherits document metadata but does not rename the measured result', () => {
    const out = normaliseExtraction(ExtractionSchema.parse({
      hospital: 'Example Lab', doctor: 'Example Doctor',
      facts: [{ date: '2021-03-11', analyte: 'Printed Result', value: 5.6 }],
    }));
    expect(out.facts[0]).toMatchObject({ analyte: 'Printed Result', analyteAsPrinted: 'Printed Result', hospital: 'Example Lab', doctor: 'Example Doctor' });
  });
});

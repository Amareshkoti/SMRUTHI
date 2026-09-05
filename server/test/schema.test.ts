import { describe, it, expect } from 'vitest';
import { canonicaliseAnalyte, normaliseExtraction, ExtractionSchema } from '../src/schema.js';

describe('canonicaliseAnalyte', () => {
  it.each([
    ['Glycated Haemoglobin', 'HbA1c'],
    ['Glycosylated Haemoglobin', 'HbA1c'],
    ['HBA1C', 'HbA1c'],
    ['A1c', 'HbA1c'],
    ['hb a1c', 'HbA1c'],
    ['FBS', 'Fasting Glucose'],
    ['Fasting Blood Sugar', 'Fasting Glucose'],
    ['Serum Creatinine', 'Creatinine'],
    ['Hemoglobin', 'Haemoglobin'],
  ])('maps %s to %s', (input, expected) => {
    expect(canonicaliseAnalyte(input)).toBe(expected);
  });

  it('leaves an unknown analyte untouched', () => {
    expect(canonicaliseAnalyte('Vitamin B12')).toBe('Vitamin B12');
  });

  it('is why one series does not fragment across differently-worded reports', () => {
    const names = ['Glycated Haemoglobin (HbA1c)'.replace(/\s*\(.*\)/, ''), 'HbA1C', 'A1c'];
    expect(new Set(names.map(canonicaliseAnalyte)).size).toBe(1);
  });
});

describe('ExtractionSchema', () => {
  it('rejects a value that arrived as a string instead of a number', () => {
    const bad = { facts: [{ date: '2021-03-11', analyte: 'HbA1c', value: '5.6' }] };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a malformed date', () => {
    const bad = { facts: [{ date: '11/03/2021', analyte: 'HbA1c', value: 5.6 }] };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a minimal valid fact and fills defaults', () => {
    const ok = ExtractionSchema.parse({ facts: [{ date: '2021-03-11', analyte: 'HbA1c', value: 5.6 }] });
    expect(ok.facts[0]).toMatchObject({ unit: '', refLow: null, refHigh: null });
  });
});

describe('normaliseExtraction', () => {
  it('lets a fact inherit the document hospital and doctor', () => {
    const out = normaliseExtraction(
      ExtractionSchema.parse({
        hospital: 'Apollo',
        doctor: 'Dr. Rao',
        facts: [{ date: '2021-03-11', analyte: 'Glycated Haemoglobin', value: 5.6 }],
      }),
    );
    expect(out.facts[0]).toMatchObject({ analyte: 'HbA1c', hospital: 'Apollo', doctor: 'Dr. Rao' });
  });

  it('preserves the printed name while canonicalising the analyte', () => {
    const out = normaliseExtraction(
      ExtractionSchema.parse({
        facts: [{ date: '2021-03-11', analyte: 'Glycated Haemoglobin', analyteAsPrinted: 'Glycated Haemoglobin', value: 5.6 }],
      }),
    );
    expect(out.facts[0]!.analyte).toBe('HbA1c');
    expect(out.facts[0]!.analyteAsPrinted).toBe('Glycated Haemoglobin');
  });
});

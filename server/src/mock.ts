import type { Extraction } from './schema.js';

/**
 * Offline demo mode (SMRUTI_MOCK=1). Returns the five-year series without
 * touching the network, so the demo survives a dead venue wifi or an expired key.
 */
const YEARS = [
  { y: 2021, a1c: 5.6, fbs: 92, chol: 176, hospital: 'Apollo Diagnostics', doctor: 'Dr. K. Ramesh Rao' },
  { y: 2022, a1c: 5.8, fbs: 98, chol: 184, hospital: 'Yashoda Laboratory Services', doctor: 'Dr. S. Lakshmi Prasad' },
  { y: 2023, a1c: 6.0, fbs: 104, chol: 192, hospital: 'KIMS Hospitals', doctor: 'Dr. P. Anand Kumar' },
  { y: 2024, a1c: 6.2, fbs: 111, chol: 198, hospital: 'Care Hospitals', doctor: 'Dr. M. Sridevi' },
  { y: 2025, a1c: 6.4, fbs: 118, chol: 205, hospital: 'Continental Labs', doctor: 'Dr. A. Venkatesh' },
];

let cursor = 0;

export function mockExtraction(name: string): Extraction {
  const yearInName = name.match(/(20\d{2})/)?.[1];
  const row = yearInName
    ? (YEARS.find((r) => String(r.y) === yearInName) ?? YEARS[cursor++ % YEARS.length]!)
    : YEARS[cursor++ % YEARS.length]!;
  const date = `${row.y}-03-11`;
  const base = { date, doctor: row.doctor, hospital: row.hospital, refLow: null, refHigh: null };
  return {
    documentTitle: 'Laboratory Investigation Report',
    documentDate: date,
    hospital: row.hospital,
    doctor: row.doctor,
    facts: [
      { ...base, analyte: 'HbA1c', analyteAsPrinted: 'Glycated Haemoglobin (HbA1c)', value: row.a1c, unit: '%', refLow: 4.0, refHigh: 6.5 },
      { ...base, analyte: 'Fasting Glucose', analyteAsPrinted: 'Fasting Blood Sugar (FBS)', value: row.fbs, unit: 'mg/dL', refLow: 70, refHigh: 110 },
      { ...base, analyte: 'Total Cholesterol', analyteAsPrinted: 'Total Cholesterol', value: row.chol, unit: 'mg/dL', refHigh: 200 },
    ],
  };
}

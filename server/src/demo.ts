/** Runs all five sample reports through the full pipeline and prints the verdict. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseDocumentImage } from './nim/parse.js';
import { extractFacts } from './nim/extract.js';
import { prepareForParse } from './util/image.js';
import { detectTrends } from './health/trends.js';
import type { HealthFact } from './schema.js';

const dir = '../samples';
const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.png$/.test(f)).sort();
const all: HealthFact[] = [];

for (const f of files) {
  const t = Date.now();
  const img = await prepareForParse(readFileSync(`${dir}/${f}`));
  const parsed = await parseDocumentImage(img.base64, img.mimeType);
  const ex = await extractFacts(parsed.markdown);
  all.push(...ex.facts);
  const a1c = ex.facts.find((x) => x.analyte === 'HbA1c');
  console.log(
    `${f.padEnd(26)} ${String(ex.facts.length).padStart(2)} facts  ` +
      `HbA1c=${a1c?.value ?? '?'}  ${ex.hospital.slice(0, 24).padEnd(24)} ${Date.now() - t}ms`,
  );
}

writeFileSync('demo-facts.json', JSON.stringify(all, null, 2));
console.log(`\n${all.length} facts total from ${files.length} documents.\n`);

for (const i of detectTrends(all)) {
  console.log(`[${i.severity.toUpperCase()}] ${i.analyte}  ${i.direction}  ${i.slopePerYear.toFixed(3)}/yr`);
  console.log(`  ${i.points.map((p) => `${p.date.slice(0, 4)}:${p.value}`).join('  ')}`);
  console.log(`  every report normal on its own: ${i.everyReportLookedNormal}   band: ${i.band ?? '-'}`);
  console.log(`  ${i.statement}\n`);
}
process.exit(0);

/** End-to-end check: NVIDIA key, nemotron-parse, and JSON extraction. */
import { readFileSync, writeFileSync } from 'node:fs';
import { config } from './config.js';
import { parseDocumentImage } from './nim/parse.js';
import { extractFacts } from './nim/extract.js';
import { prepareForParse } from './util/image.js';

const file = process.argv[2] ?? '../samples/2021_apollo.png';
console.log(`key present : ${config.nvidiaApiKey ? 'yes' : 'NO'}`);

const img = await prepareForParse(readFileSync(file));
console.log(`image       : ${file} -> ${img.width}px jpeg, ${Math.round(img.base64.length / 1024)} KB base64\n`);

console.log(`stage 1  ${config.models.parse} ...`);
let t = Date.now();
const parsed = await parseDocumentImage(img.base64, img.mimeType);
console.log(`  OK  ${parsed.blocks.length} blocks, ${parsed.markdown.length} chars, ${Date.now() - t}ms`);
writeFileSync('parse-output.md', parsed.markdown);
console.log(`  block types: ${[...new Set(parsed.blocks.map((b) => b.type))].join(', ')}\n`);
console.log('--- markdown (first 1000 chars) ---');
console.log(parsed.markdown.slice(0, 1000));
console.log('--- end ---\n');

console.log(`stage 2  ${config.models.extract} ...`);
t = Date.now();
const ex = await extractFacts(parsed.markdown);
console.log(`  OK  ${ex.facts.length} facts, ${Date.now() - t}ms\n`);
console.log(JSON.stringify(ex, null, 2));
process.exit(0);

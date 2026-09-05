import { fetchFromDrive } from './drive/download.js';
import { parseDocumentImage } from './nim/parse.js';
import { extractFacts } from './nim/extract.js';
import { prepareForParse } from './util/image.js';
import { config } from './config.js';
import { mockExtraction } from './mock.js';
import type { Extraction } from './schema.js';

export interface IngestedDocument extends Extraction {
  sourceId: string;
  sourceName: string;
  pages: number;
  ms: number;
}

/**
 * Drive link in, structured facts out.
 *
 * The downloaded bytes live in this function's scope and nowhere else. Nothing
 * is written to disk and nothing is cached: after it returns, the server holds
 * no copy of the user's document.
 */
export async function ingestFromDrive(link: string): Promise<IngestedDocument[]> {
  const files = await fetchFromDrive(link);
  const out: IngestedDocument[] = [];

  for (const file of files) {
    const started = Date.now();

    if (config.mock) {
      out.push({ ...mockExtraction(file.name), sourceId: file.id, sourceName: file.name, pages: 1, ms: 0 });
      continue;
    }

    const pages = await toPageImages(file.bytes, file.mimeType);
    const markdowns: string[] = [];
    for (const page of pages) {
      const img = await prepareForParse(page);
      const parsed = await parseDocumentImage(img.base64, img.mimeType);
      markdowns.push(parsed.markdown);
    }

    const extraction = await extractFacts(markdowns.join('\n\n---\n\n'));
    out.push({
      ...extraction,
      sourceId: file.id,
      sourceName: file.name,
      pages: pages.length,
      ms: Date.now() - started,
    });
  }

  return out;
}

async function toPageImages(bytes: Buffer, mimeType: string): Promise<Buffer[]> {
  if (mimeType !== 'application/pdf') return [bytes];
  const { pdf } = await import('pdf-to-img');
  const doc = await pdf(bytes, { scale: 2 });
  const pages: Buffer[] = [];
  for await (const page of doc) {
    pages.push(page);
    if (pages.length >= 10) break; // a lab report is never 10 pages; guard runaway PDFs
  }
  return pages;
}

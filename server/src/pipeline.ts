import { parseDocumentImage } from './nim/parse.js';
import { extractFacts } from './nim/extract.js';
import { prepareForParse } from './util/image.js';
import { createHash } from 'node:crypto';
import { config } from './config.js';
import { mockDocuments } from './mock.js';
import type { Extraction } from './schema.js';
import { InputError } from './upload.js';

export interface IngestedDocument extends Extraction {
  sourceId: string;
  sourceName: string;
  pages: number;
  ms: number;
}

export interface UploadedFile {
  bytes: Buffer;
  mimeType: string;
  name: string;
}

/**
 * A file the user picked on their phone in, structured facts out.
 *
 * The bytes live in this function's scope and nowhere else. Nothing is written
 * to disk and nothing is cached: after it returns, the server holds no copy of
 * the user's document. That is why ingest is a request and not an upload --
 * there is no bucket, so there is nothing to leak.
 */
export async function ingestUpload(file: UploadedFile): Promise<IngestedDocument[]> {
  // Offline mode short-circuits before any model call, so the demo survives a
  // venue with no working network or an expired key.
  if (config.mock) {
    return mockDocuments();
  }

  const started = Date.now();

  const pages = await toPageImages(file.bytes, file.mimeType);
  const markdowns: string[] = [];
  for (const page of pages) {
    const img = await prepareForParse(page);
    const parsed = await parseDocumentImage(img.base64, img.mimeType);
    markdowns.push(parsed.markdown);
  }

  const extraction = await extractFacts(markdowns.join('\n\n---\n\n'));
  if (!extraction.facts.length) throw new InputError('No dated numeric results were found. Choose a readable lab report with a date.', 422);

  return [
    {
      ...extraction,
      // A picked file has no stable id, and we keep no server-side handle on it
      // either. Content-addressing makes re-uploading the same report
      // idempotent instead of doubling a trend line.
      sourceId: createHash('sha256').update(file.bytes).digest('hex').slice(0, 32),
      sourceName: file.name,
      pages: pages.length,
      ms: Date.now() - started,
    },
  ];
}

export async function toPageImages(bytes: Buffer, mimeType: string): Promise<Buffer[]> {
  if (mimeType !== 'application/pdf') return [bytes];
  const { pdf } = await import('pdf-to-img');
  const doc = await pdf(bytes, { scale: 2 });
  const pages: Buffer[] = [];
  for await (const page of doc) {
    if (pages.length >= config.maxPdfPages) throw new InputError(`This PDF exceeds ${config.maxPdfPages} pages. Split it into smaller reports.`, 413);
    pages.push(page);
  }
  if (!pages.length) throw new InputError('This PDF has no readable pages.');
  return pages;
}

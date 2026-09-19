import { reportTools } from '../../modules/report-tools';
import { parseDocumentImage } from './parse';
import { extractFacts } from './extract';
import { extractPrescriptionFromImage } from './prescription';
import type { PrescriptionExtraction } from './schema';
import type { IngestedDocument } from '../../../shared/contracts';

export interface ReportInput { uri: string; mimeType: string; name: string; sourceId: string }

/** Renders every page of a photo or PDF to text via the document reader. Nothing here is saved. */
async function readPages(file: Pick<ReportInput, 'uri' | 'mimeType'>, progress: (text: string) => void): Promise<{ text: string; pages: number }> {
  const native = reportTools();
  const pages = file.mimeType === 'application/pdf' ? await native.pageCount(file.uri) : 1;
  const texts: string[] = [];
  for (let i = 0; i < pages; i++) {
    progress(`Reading page ${i + 1} of ${pages}`);
    const image = file.mimeType === 'application/pdf'
      ? await native.renderPage(file.uri, i) : await native.renderImage(file.uri);
    texts.push((await parseDocumentImage(image, 'image/jpeg')).markdown);
  }
  return { text: texts.join('\n\n'), pages };
}

export async function ingestReport(file: ReportInput, progress: (text: string) => void = () => {}) {
  const started = Date.now();
  const { text, pages } = await readPages(file, progress);
  progress('Checking the report and extracting results');
  const extracted = await extractFacts(text);
  const normal = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!extracted.isMedicalReport || !extracted.medicalEvidence || !normal(text).includes(normal(extracted.medicalEvidence))) {
    throw new Error('This does not appear to be a medical report. Choose an original lab or medical report.');
  }
  if (!extracted.facts.length) throw new Error('No dated numeric results were found. Choose a readable medical report showing its date and results.');
  const document: IngestedDocument = { ...extracted, sourceId: file.sourceId, sourceName: file.name, pages, ms: Date.now() - started };
  return { documents: [document], factCount: document.facts.length };
}

/**
 * Reads a photographed or scanned prescription and lists its medicines. This
 * is deliberately not persisted anywhere -- no document, no facts, nothing is
 * written to Supabase or the local cache. The result lives only in the
 * caller's memory for as long as it takes to chat about it.
 *
 * Unlike ingestReport, each page's image goes straight to the model that
 * reads it (see prescription.ts) -- handwriting is ambiguous enough that the
 * step deciding what a word says needs to see the page, not a transcript of
 * a decision an earlier, separate step already made.
 */
export async function ingestPrescription(
  file: Pick<ReportInput, 'uri' | 'mimeType'>,
  progress: (text: string) => void = () => {},
): Promise<PrescriptionExtraction> {
  const native = reportTools();
  const pages = file.mimeType === 'application/pdf' ? await native.pageCount(file.uri) : 1;

  progress(pages > 1 ? `Rendering ${pages} pages` : 'Rendering the page');
  const images: string[] = [];
  for (let i = 0; i < pages; i++) {
    images.push(file.mimeType === 'application/pdf' ? await native.renderPage(file.uri, i) : await native.renderImage(file.uri));
  }

  // Rendering is local and fast; the vision call is the slow part and each
  // page is independent, so run them together instead of one at a time.
  progress(pages > 1 ? `Reading ${pages} pages` : 'Reading the prescription');
  const results = await Promise.all(images.map((image) => extractPrescriptionFromImage(image, 'image/jpeg')));

  progress('Checking the prescription');
  const medicines = results.flatMap((r) => r.medicines);
  if (!results.some((r) => r.isPrescription)) {
    throw new Error('This does not appear to be a prescription. Choose an original doctor\'s prescription.');
  }
  if (!medicines.length) throw new Error('No medicines were found. Choose a readable photo showing the prescribed medicines.');
  const primary = results.find((r) => r.isPrescription) ?? results[0]!;
  return { ...primary, medicines };
}

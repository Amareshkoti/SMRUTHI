import { reportTools } from '../../modules/report-tools';
import { parseDocumentImage } from './parse';
import { extractFacts } from './extract';
import type { IngestedDocument } from '../../../shared/contracts';

export interface ReportInput { uri: string; mimeType: string; name: string; sourceId: string }
export async function ingestReport(file: ReportInput, progress: (text: string) => void = () => {}) {
  const started = Date.now();
  const native = reportTools();
  const pages = file.mimeType === 'application/pdf' ? await native.pageCount(file.uri) : 1;
  const texts: string[] = [];
  for (let i = 0; i < pages; i++) {
    progress(`Reading page ${i + 1} of ${pages}`);
    const image = file.mimeType === 'application/pdf'
      ? await native.renderPage(file.uri, i) : await native.renderImage(file.uri);
    texts.push((await parseDocumentImage(image, 'image/jpeg')).markdown);
  }
  progress('Checking the report and extracting results');
  const text = texts.join('\n\n');
  const extracted = await extractFacts(text);
  const normal = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!extracted.isMedicalReport || !extracted.medicalEvidence || !normal(text).includes(normal(extracted.medicalEvidence))) {
    throw new Error('This does not appear to be a medical report. Choose an original lab or medical report.');
  }
  if (!extracted.facts.length) throw new Error('No dated numeric results were found. Choose a readable medical report showing its date and results.');
  const document: IngestedDocument = { ...extracted, sourceId: file.sourceId, sourceName: file.name, pages, ms: Date.now() - started };
  return { documents: [document], factCount: document.facts.length };
}

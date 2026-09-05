import { config } from '../config.js';
import { chat, extractJsonBlock, NimError } from './client.js';
import { ExtractionSchema, normaliseExtraction, type Extraction } from '../schema.js';

const SYSTEM = `You convert Indian medical lab reports into structured data.

Return ONLY a JSON object, no prose, no markdown fence, matching exactly:
{
  "documentTitle": string,
  "documentDate": "YYYY-MM-DD",
  "hospital": string,
  "doctor": string,
  "facts": [
    {
      "date": "YYYY-MM-DD",
      "analyte": string,
      "analyteAsPrinted": string,
      "value": number,
      "unit": string,
      "refLow": number|null,
      "refHigh": number|null,
      "doctor": string,
      "hospital": string
    }
  ]
}

Rules:
- "analyte" MUST be the canonical name. Map every synonym: Glycated Haemoglobin,
  Glycosylated Haemoglobin, HbA1C, A1c -> "HbA1c". FBS -> "Fasting Glucose".
  PPBS -> "Postprandial Glucose". Hb -> "Haemoglobin".
- "analyteAsPrinted" keeps the exact wording from the page.
- "value" is a number only. Never include the unit, never a range, never a string.
- Parse a reference range like "4.0 - 6.5" into refLow 4.0 and refHigh 6.5.
  If the range is one-sided such as "< 5.7", set refLow null and refHigh 5.7.
  If no range is printed, use null for both.
- Indian dates are usually DD/MM/YYYY. Convert to YYYY-MM-DD.
- Every fact inherits the report's date unless its own row states a different one.
- Skip any row whose value is not numeric (comments, qualitative results).
- If the page is not a medical report, return facts as an empty array.`;

export async function extractFacts(markdown: string): Promise<Extraction> {
  const ask = (extraNote?: string) =>
    chat({
      model: config.models.extract,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content:
            (extraNote ? `Your previous reply was rejected: ${extraNote}\nReturn valid JSON only.\n\n` : '') +
            `Report text:\n\n${markdown}`,
        },
      ],
      temperature: 0,
      maxTokens: 4096,
    });

  let lastError = '';
  // Two attempts: a schema violation is fed back so the model can correct it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(attempt === 0 ? undefined : lastError);
    const parsed = ExtractionSchema.safeParse(safeJson(extractJsonBlock(raw)));
    if (parsed.success) return normaliseExtraction(parsed.data);
    lastError = parsed.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
  }
  throw new Error(`Extraction did not produce valid JSON after 2 attempts. Last error: ${lastError}`);
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

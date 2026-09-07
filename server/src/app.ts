import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { config, type Language } from './config.js';
import { ingestUpload } from './pipeline.js';
import { detectTrends } from './health/trends.js';
import { answerQuestion, phraseWarning } from './nim/answer.js';
import { HealthFactSchema } from './schema.js';
import { NimError } from './nim/client.js';
import { requireUser, type AuthedRequest } from './auth.js';
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES, MAX_FACTS, MAX_HISTORY, MAX_QUESTION_CHARS, LANGUAGES } from '../../shared/contracts.js';
import { decodeUpload, InputError } from './upload.js';



export const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.allowedOrigins.length ? config.allowedOrigins : true }));
// A phone camera photo of a lab report runs to a few MB, and base64 inflates it
// by a third. 25mb is generous for one report and still bounded.
app.use(express.json({ limit: Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 + 4096 }));
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mock: config.mock,
  });
});

/**
 * A picked file -> structured facts. The bytes are read once and dropped; the
 * rows go back to the phone, which writes them to Supabase under its own
 * session. This server stores nothing and holds no database handle.
 */
const UploadBody = z.object({
  /** base64, no data: prefix. */
  fileBase64: z.string().min(1).max(Math.ceil(MAX_UPLOAD_BYTES / 3) * 4),
  mimeType: z.string().min(1),
  name: z.string().max(255).default('report'),
});

const ACCEPTED = ACCEPTED_MIME_TYPES;

app.post('/api/ingest', requireUser, async (req, res) => {
  const body = UploadBody.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: 'Send { "fileBase64": "...", "mimeType": "..." }' });
  }
  if (!ACCEPTED.includes(body.data.mimeType)) {
    return res.status(415).json({
      error: `That file type is not supported. Send a PDF or a photo (${ACCEPTED.join(', ')}).`,
    });
  }
  try {
    const bytes = decodeUpload(body.data.fileBase64, body.data.mimeType);
    if (bytes.length === 0) return res.status(400).json({ error: 'That file came through empty.' });
    const docs = await ingestUpload({ bytes, mimeType: body.data.mimeType, name: body.data.name });
    const factCount = docs.reduce((n, d) => n + d.facts.length, 0);
    res.json({ documents: docs, factCount });
  } catch (err) {
    res.status(statusFor(err)).json({ error: messageFor(err) });
  }
});

const FactsBody = z.object({
  facts: z.array(HealthFactSchema).max(MAX_FACTS),
  language: z.enum(LANGUAGES).default('en'),
});

/** Trends are computed here, in code. No model is consulted. */
app.post('/api/insights', requireUser, (req, res) => {
  const body = FactsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Send { "facts": [...] }' });
  res.json({ insights: detectTrends(body.data.facts) });
});

/** Phrases an already-computed warning in the user's language. */
app.post('/api/warning', requireUser, async (req, res) => {
  const body = FactsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Send { "facts": [...] }' });
  const insights = detectTrends(body.data.facts);
  const top = insights.find((i) => i.severity === 'warning');
  if (!top) return res.json({ insight: null, message: null });
  try {
    const message = await phraseWarning(top, body.data.language as Language);
    res.json({ insight: top, message });
  } catch (err) {
    // The finding is real even if phrasing failed; fall back to the computed text.
    res.json({ insight: top, message: top.statement, degraded: messageFor(err) });
  }
});

/**
 * The conversation lives on the phone; it is replayed to us on every ask and
 * held only for the length of this request. Nothing here is written down.
 */
const HistorySchema = z
  .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(12000) }))
  .max(MAX_HISTORY)
  .default([]);

app.post('/api/ask', requireUser, async (req, res) => {
  const body = FactsBody.extend({
    question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
    history: HistorySchema,
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Send { "question": "...", "facts": [...] }' });
  try {
    const insights = detectTrends(body.data.facts);
    const answer = await answerQuestion({
      question: body.data.question,
      facts: body.data.facts,
      insights,
      history: body.data.history,
      language: body.data.language as Language,
    });
    res.json({ answer, insights });
  } catch (err) {
    res.status(statusFor(err)).json({ error: messageFor(err) });
  }
});

function statusFor(err: unknown): number {
  if (err instanceof InputError) return err.status;
  if (err instanceof NimError) return 502;
  return 500;
}
function messageFor(err: unknown): string {
  if (err instanceof NimError) return `The AI service returned an error (HTTP ${err.status}).`;
  return err instanceof Error ? err.message : 'Something went wrong.';
}


const errors: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err?.type === 'entity.too.large' ? 413 : err instanceof SyntaxError ? 400 : 500;
  res.status(status).json({ error: status === 413 ? 'The upload is too large.' : status === 400 ? 'Invalid JSON request.' : 'The request could not be completed.' });
};
app.use(errors);

import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { config, assertConfigured, type Language } from './config.js';
import { ingestFromDrive } from './pipeline.js';
import { detectTrends } from './health/trends.js';
import { answerQuestion, phraseWarning } from './nim/answer.js';
import { HealthFactSchema } from './schema.js';
import { NimError } from './nim/client.js';

assertConfigured();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mock: config.mock,
    keyConfigured: Boolean(config.nvidiaApiKey),
    driveFolderSupport: Boolean(config.googleApiKey),
    models: config.models,
  });
});

/** Drive link -> structured facts. The document itself is never stored. */
app.post('/api/ingest', async (req, res) => {
  const body = z.object({ link: z.string() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Send { "link": "<drive url>" }' });
  try {
    const docs = await ingestFromDrive(body.data.link);
    const factCount = docs.reduce((n, d) => n + d.facts.length, 0);
    res.json({ documents: docs, factCount });
  } catch (err) {
    res.status(statusFor(err)).json({ error: messageFor(err) });
  }
});

const FactsBody = z.object({
  facts: z.array(HealthFactSchema),
  language: z.enum(['en', 'hi', 'te']).default('en'),
});

/** Trends are computed here, in code. No model is consulted. */
app.post('/api/insights', (req, res) => {
  const body = FactsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Send { "facts": [...] }' });
  res.json({ insights: detectTrends(body.data.facts) });
});

/** Phrases an already-computed warning in the user's language. */
app.post('/api/warning', async (req, res) => {
  const body = FactsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Send { "facts": [...] }' });
  const insights = detectTrends(body.data.facts);
  const top = insights.find((i) => i.severity === 'warning');
  if (!top) return res.json({ insight: null, message: null });
  try {
    const message = config.mock ? top.statement : await phraseWarning(top, body.data.language as Language);
    res.json({ insight: top, message });
  } catch (err) {
    // The finding is real even if phrasing failed; fall back to the computed text.
    res.json({ insight: top, message: top.statement, degraded: messageFor(err) });
  }
});

app.post('/api/ask', async (req, res) => {
  const body = FactsBody.extend({ question: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Send { "question": "...", "facts": [...] }' });
  try {
    const insights = detectTrends(body.data.facts);
    const answer = await answerQuestion({
      question: body.data.question,
      facts: body.data.facts,
      insights,
      language: body.data.language as Language,
    });
    res.json({ answer, insights });
  } catch (err) {
    res.status(statusFor(err)).json({ error: messageFor(err) });
  }
});

function statusFor(err: unknown): number {
  if (err instanceof NimError) return 502;
  return 400;
}
function messageFor(err: unknown): string {
  if (err instanceof NimError) return `The AI service returned an error (HTTP ${err.status}).`;
  return err instanceof Error ? err.message : 'Something went wrong.';
}

app.listen(config.port, () => {
  console.log(`SMRUTI server on http://localhost:${config.port}`);
  console.log(`  mock mode : ${config.mock ? 'ON (no NVIDIA calls)' : 'off'}`);
  console.log(`  key       : ${config.nvidiaApiKey ? 'configured' : 'MISSING'}`);
  console.log(`  folders   : ${config.googleApiKey ? 'enabled' : 'single files only'}`);
});

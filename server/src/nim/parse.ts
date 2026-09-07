import { config } from '../config.js';
import { NimError } from './client.js';

/**
 * Stage 1 -- document image to text blocks, via nvidia/nemotron-parse.
 *
 * This model does NOT behave like a normal chat model, and the differences are
 * all load-bearing. Verified against the live endpoint:
 *
 *  - It rejects any text part: {"type":"text"} returns 400 "does not support
 *    text input". Control tokens documented for the self-hosted NIM container
 *    are not accepted here. The message content is the image and nothing else.
 *  - It accepts exactly one message. A system message returns 400
 *    "Expected exactly one message".
 *  - It returns nothing in message.content (null). The result arrives as a
 *    tool call named "markdown_bbox" whose arguments are a JSON array of
 *    {bbox, text, type} blocks in reading order.
 */

export interface ParsedBlock {
  text: string;
  /** Semantic class from the model, e.g. Page-header, Table, Text, Title. */
  type: string;
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
}

export interface ParseResult {
  blocks: ParsedBlock[];
  /** Blocks flattened to markdown, which is what stage 2 consumes. */
  markdown: string;
}

/** Inline base64 must stay well under the endpoint's payload ceiling. */
export const MAX_INLINE_BASE64_BYTES = 180_000;

export async function parseDocumentImage(
  imageBase64: string,
  mimeType = 'image/jpeg',
): Promise<ParseResult> {
  if (imageBase64.length > MAX_INLINE_BASE64_BYTES) {
    throw new Error(
      `Image is ${Math.round(imageBase64.length / 1024)} KB as base64, over the ` +
        `${Math.round(MAX_INLINE_BASE64_BYTES / 1024)} KB inline limit. Downscale before calling.`,
    );
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120_000);
  try {
    const res = await fetch(`${config.nimBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.nvidiaApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: config.models.parse,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        max_tokens: 8000,
        temperature: 0,
      }),
      signal: ac.signal,
    });
    const body = await res.text();
    if (!res.ok) throw new NimError(res.status, config.models.parse, body);
    return toResult(body);
  } finally {
    clearTimeout(timer);
  }
}

function toResult(body: string): ParseResult {
  const json = JSON.parse(body) as {
    choices?: {
      finish_reason?: string;
      message?: {
        content?: string | null;
        tool_calls?: { function?: { arguments?: string } }[];
      };
    }[];
  };
  const msg = json.choices?.[0]?.message;
  if (json.choices?.[0]?.finish_reason === 'length') throw new Error('The page text was truncated. Try a smaller report page.');
  const args = msg?.tool_calls?.[0]?.function?.arguments;

  if (!args) {
    // Some revisions may return plain content instead; accept that too.
    const content = msg?.content ?? '';
    if (content) return { blocks: [{ text: content, type: 'Text', bbox: null }], markdown: content };
    throw new Error('nemotron-parse returned neither tool_calls nor content');
  }

  // arguments is a JSON array, sometimes nested one level: [[{...}]]
  const raw = JSON.parse(args) as unknown;
  const flat = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as {
    text?: string;
    type?: string;
    bbox?: ParsedBlock['bbox'];
  }[];

  if (!Array.isArray(flat)) throw new Error('The document reader returned invalid blocks.');
  const blocks: ParsedBlock[] = flat
    .filter((b) => typeof b?.text === 'string' && b.text.trim() !== '')
    .map((b) => ({ text: b.text!.trim(), type: typeof b.type === 'string' ? b.type : 'Text', bbox: b.bbox ?? null }));

  return { blocks, markdown: blocksToMarkdown(blocks) };
}

/** Keep the semantic class as a hint; stage 2 reads better with the structure. */
function blocksToMarkdown(blocks: ParsedBlock[]): string {
  return blocks
    .map((b) => {
      const t = b.type.toLowerCase();
      if (t.includes('title')) return `# ${b.text}`;
      if (t.includes('header')) return `## ${b.text}`;
      if (t.includes('table')) return `\n${b.text}\n`;
      return b.text;
    })
    .join('\n\n');
}

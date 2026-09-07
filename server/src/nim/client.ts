import { config } from '../config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | unknown[];
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Extra body fields (nemotron-parse wants repetition_penalty, for example). */
  extra?: Record<string, unknown>;
  timeoutMs?: number;
}

export class NimError extends Error {
  constructor(
    readonly status: number,
    readonly model: string,
    readonly body: string,
  ) {
    super(`Model service returned HTTP ${status}`);
    this.name = 'NimError';
  }
}

/**
 * The ONLY place the NVIDIA credential is attached to a request.
 * Nothing above this function ever sees the key.
 */
export async function chat(opts: ChatOptions): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 180_000);
  try {
    const res = await fetch(`${config.nimBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.nvidiaApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 2048,
        ...opts.extra,
      }),
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new NimError(res.status, opts.model, text);
    const json = JSON.parse(text) as {
      choices?: { finish_reason?: string; message?: { content?: string } }[];
    };
    const choice = json.choices?.[0];
    if (!choice || choice.finish_reason === 'length' || choice.finish_reason === 'content_filter') {
      throw new Error('The model did not return a complete answer. Please retry.');
    }
    return finalContent(choice.message?.content);
  } finally {
    clearTimeout(timer);
  }
}

export function finalContent(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('The model did not return a final answer.');
  const final = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!final || /<\|(?:analysis|assistant|system|user)[^>]*\|>/i.test(final)) {
    throw new Error('The model did not return a usable final answer. Please retry.');
  }
  return final;
}

/** Strip ```json fences and any prose a model wrapped around its JSON. */
export function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

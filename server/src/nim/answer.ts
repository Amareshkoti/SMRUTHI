import { config, type Language } from '../config.js';
import { chat } from './client.js';
import type { HealthFact } from '../schema.js';
import type { Insight } from '../health/trends.js';

const LANGUAGE_NAME: Record<Language, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  te: 'Telugu (Telugu script)',
};

/**
 * Telugu is routed to Ultra deliberately.
 *
 * Measured on the live endpoints: nemotron-3-super-120b produced Telugu output
 * contaminated with Devanagari and romanised words, collapsed into token
 * repetition, and rendered a rising trend as "improving" -- inverting the
 * clinical meaning. nemotron-3-ultra-550b produced clean, correct Telugu.
 * riva-translate cannot help here: it covers 37 languages and Telugu is not
 * one of them, and it silently answers in Hindi when asked for Telugu.
 */
function modelFor(language: Language): string {
  return language === 'te' ? config.models.answerTelugu : config.models.answer;
}

function systemPrompt(language: Language): string {
  return `You are SMRUTI, a health memory assistant for an Indian user.

Answer ONLY in ${LANGUAGE_NAME[language]}. Every word of your reply must be in that language.

You are given facts taken from the user's OWN medical reports, and any trends
that were computed from them by software.

Absolute rules:
- Use ONLY the facts given. If the answer is not in them, say you do not have
  that report yet. Never estimate, never fill a gap from general knowledge.
- Never diagnose and never name a disease as a conclusion. You may repeat a
  range description that was given to you.
- Never invent a trend. If a trend is supplied, you may restate it. If none is
  supplied, do not imply one exists.
- Speak simply and warmly, for someone who may not read well. Short sentences.
- When something is worth acting on, end by suggesting they see a doctor.`;
}

function factLines(facts: HealthFact[]): string {
  return [...facts]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (f) =>
        `${f.date} | ${f.analyte} | ${f.value}${f.unit ? ' ' + f.unit : ''}` +
        `${f.refLow !== null || f.refHigh !== null ? ` | normal ${f.refLow ?? ''}-${f.refHigh ?? ''}` : ''}` +
        `${f.hospital ? ` | ${f.hospital}` : ''}`,
    )
    .join('\n');
}

export async function answerQuestion(opts: {
  question: string;
  facts: HealthFact[];
  insights: Insight[];
  language: Language;
}): Promise<string> {
  const { question, facts, insights, language } = opts;

  if (facts.length === 0) {
    return {
      en: 'You have not added any reports yet. Add one from Google Drive and I can answer questions about it.',
      hi: 'आपने अभी तक कोई रिपोर्ट नहीं जोड़ी है। Google Drive से एक रिपोर्ट जोड़ें, फिर मैं उसके बारे में बता सकता हूँ।',
      te: 'మీరు ఇంకా ఏ రిపోర్ట్ కూడా చేర్చలేదు. Google Drive నుండి ఒక రిపోర్ట్ చేర్చండి, అప్పుడు నేను దాని గురించి చెప్పగలను.',
    }[language];
  }

  const trendBlock = insights.length
    ? `\n\nTrends computed by software (these are verified facts, not your opinion):\n` +
      insights.map((i) => `- ${i.statement}`).join('\n')
    : '\n\nNo trend was computed. Do not suggest one exists.';

  return chat({
    model: modelFor(language),
    messages: [
      { role: 'system', content: systemPrompt(language) },
      {
        role: 'user',
        content:
          `Facts from the user's reports:\n${factLines(facts)}` +
          trendBlock +
          `\n\nThe user asks: ${question}`,
      },
    ],
    temperature: 0.3,
    maxTokens: 700,
  });
}

/**
 * Phrases an already-computed warning. The finding itself comes from
 * detectTrends(); the model only says it in the user's language.
 */
export async function phraseWarning(insight: Insight, language: Language): Promise<string> {
  return chat({
    model: modelFor(language),
    messages: [
      {
        role: 'system',
        content:
          `Restate the following finding in ${LANGUAGE_NAME[language]}, in 2 or 3 short warm ` +
          `sentences, for someone who may not read well. Do NOT add any fact that is not ` +
          `stated. Do NOT name a disease. End by suggesting they see a doctor. ` +
          `Reply only in ${LANGUAGE_NAME[language]}.`,
      },
      { role: 'user', content: insight.statement },
    ],
    temperature: 0.3,
    maxTokens: 300,
  });
}

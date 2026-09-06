import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { c, font, space } from '../theme';
import { Screen, LanguagePicker, Notice } from '../components/Chrome';
import { api, type Fact, type Language } from '../api';

const SUGGESTIONS: Record<Language, string[]> = {
  en: [
    'Is my sugar increasing year by year?',
    'What was my HbA1c in 2023?',
    'Which hospitals have my reports?',
  ],
  hi: [
    'क्या मेरी शुगर हर साल बढ़ रही है?',
    '2023 में मेरा HbA1c कितना था?',
    'मेरी रिपोर्ट किन अस्पतालों से हैं?',
  ],
  te: [
    'నా షుగర్ సంవత్సరానికి పెరుగుతోందా?',
    '2023లో నా HbA1c ఎంత ఉంది?',
    'నా రిపోర్టులు ఏ ఆసుపత్రుల నుండి ఉన్నాయి?',
  ],
};

export function AskScreen({
  facts,
  language,
  onLanguage,
}: {
  facts: Fact[];
  language: Language;
  onLanguage: (l: Language) => void;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setAsked(q);
    setQuestion('');
    try {
      const res = await api.ask(q, facts, language);
      setAnswer(res.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.label}>ASK</Text>
        <Text style={styles.title}>In the language{'\n'}you think in.</Text>
      </View>

      <View style={styles.langSlot}>
        <LanguagePicker value={language} onChange={onLanguage} />
      </View>

      {asked ? (
        <View style={styles.askedRow}>
          <View style={styles.askedBubble}>
            <Text style={styles.askedText}>{asked}</Text>
          </View>
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busyRow}>
          <View style={styles.busyDot} />
          <Text style={styles.busyText}>Thinking…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.slot}>
          <Notice text={error} tone="error" />
        </View>
      ) : null}

      {answer ? (
        <View style={styles.answerBubble}>
          <Text style={styles.answerText}>{answer}</Text>
          <Text style={styles.answerFoot}>
            Draws on your {facts.length} remembered results, and general medical knowledge when needed.
          </Text>
        </View>
      ) : null}

      <Text style={styles.tryLabel}>TRY</Text>
      <View style={styles.suggestions}>
        {SUGGESTIONS[language].map((s) => (
          <Pressable key={s} onPress={() => ask(s)} disabled={busy} style={styles.suggestion}>
            <Text style={styles.suggestionText}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask about your reports"
          placeholderTextColor={c.textFaint}
          style={styles.input}
          editable={!busy}
          onSubmitEditing={() => ask(question)}
        />
        <Pressable onPress={() => ask(question)} disabled={busy || !question.trim()} style={styles.send}>
          <Text style={styles.sendArrow}>→</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space(3), paddingTop: space(1.25) },
  label: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.textFaint },
  title: { fontFamily: font.display, fontSize: 38, lineHeight: 44, color: c.text, marginTop: space(1.25) },

  langSlot: { marginHorizontal: space(3), marginTop: space(2.5) },

  askedRow: { marginTop: space(3), marginHorizontal: space(3), alignItems: 'flex-end' },
  askedBubble: { maxWidth: '78%', borderRadius: 18, borderBottomRightRadius: 4, backgroundColor: 'rgba(255,255,255,.07)', paddingVertical: space(1.75), paddingHorizontal: space(2) },
  askedText: { fontFamily: font.body, fontSize: 15, lineHeight: 23, color: c.text },

  busyRow: { flexDirection: 'row', alignItems: 'center', gap: space(0.75), marginTop: space(1.5), marginHorizontal: space(3) },
  busyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.gold },
  busyText: { fontFamily: font.body, fontSize: 12, color: c.textFaint },

  slot: { marginTop: space(1.5), marginHorizontal: space(3) },

  answerBubble: { marginTop: space(1.5), marginHorizontal: space(3), borderRadius: 18, borderBottomLeftRadius: 4, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hair, padding: space(2.5) },
  answerText: { fontFamily: font.body, fontSize: 16, lineHeight: 26, color: '#E6EAEC' },
  answerFoot: { fontFamily: font.body, fontSize: 11, color: c.textFaint, marginTop: space(1.75), paddingTop: space(1.5), borderTopWidth: 1, borderTopColor: c.hair },

  tryLabel: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.textFaint, marginTop: space(3.25), marginHorizontal: space(3) },
  suggestions: { marginTop: space(1.5), marginHorizontal: space(3), gap: space(1) },
  suggestion: { borderRadius: 14, borderWidth: 1, borderColor: c.hairSoft, paddingVertical: space(1.625), paddingHorizontal: space(2) },
  suggestionText: { fontFamily: font.body, fontSize: 14, lineHeight: 22, color: c.textMuted },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: space(1.25), marginTop: space(3.25), marginHorizontal: space(3),
    borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairSoft, paddingVertical: space(1.5), paddingLeft: space(2), paddingRight: space(1.5),
  },
  input: { flex: 1, color: c.text, fontSize: 15, fontFamily: font.body, paddingVertical: space(1) },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  sendArrow: { color: c.ink, fontSize: 16 },
});

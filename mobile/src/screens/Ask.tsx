import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator, Pressable } from 'react-native';
import { c, font, space, type } from '../theme';
import { Screen, Button, LanguagePicker, Notice } from '../components/Chrome';
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
    <Screen title="Ask" subtitle="You do not search. You just ask, in the language you think in.">
      <View style={styles.slot}>
        <LanguagePicker value={language} onChange={onLanguage} />
      </View>

      <View style={styles.box}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask about your reports"
          placeholderTextColor={c.inkFaint}
          style={styles.input}
          multiline
          editable={!busy}
        />
        <Button
          label={busy ? 'Thinking…' : 'Ask'}
          onPress={() => ask(question)}
          disabled={busy || !question.trim()}
        />
      </View>

      <View style={styles.slot}>
        <Text style={type.small}>Try one of these</Text>
        {SUGGESTIONS[language].map((s) => (
          <Pressable
            key={s}
            onPress={() => {
              setQuestion(s);
              ask(s);
            }}
            disabled={busy}
            style={styles.suggestion}
          >
            <Text style={styles.suggestionText}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {busy ? (
        <View style={styles.slot}>
          <ActivityIndicator color={c.ink} />
        </View>
      ) : null}

      {error ? (
        <View style={styles.slot}>
          <Notice text={error} tone="error" />
        </View>
      ) : null}

      {answer ? (
        <View style={styles.answer}>
          {asked ? <Text style={styles.asked}>{asked}</Text> : null}
          <Text style={styles.answerText}>{answer}</Text>
          <Text style={[type.small, styles.foot]}>
            Answered only from your own {facts.length} remembered results.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  slot: { marginLeft: space(5), marginRight: space(2.5), marginBottom: space(2), gap: space(1) },
  box: {
    backgroundColor: c.surface,
    marginLeft: space(5),
    marginRight: space(2.5),
    marginBottom: space(2.5),
    padding: space(2.5),
    gap: space(2),
  },
  input: {
    fontFamily: font.body,
    fontSize: 18,
    lineHeight: 27,
    color: c.ink,
    minHeight: 76,
    textAlignVertical: 'top',
    borderBottomWidth: 1.5,
    borderBottomColor: c.ink,
    paddingBottom: space(1),
  },
  suggestion: { paddingVertical: space(1.25), borderBottomWidth: 1, borderBottomColor: c.mist },
  suggestionText: { fontFamily: font.body, fontSize: 16, lineHeight: 24, color: c.inkSoft },
  answer: {
    backgroundColor: c.surface,
    marginLeft: space(5),
    marginRight: space(2.5),
    padding: space(2.5),
    borderLeftWidth: 3,
    borderLeftColor: c.ink,
  },
  asked: {
    fontFamily: font.display,
    fontSize: 18,
    lineHeight: 26,
    color: c.inkFaint,
    marginBottom: space(1.5),
  },
  answerText: { fontFamily: font.body, fontSize: 18, lineHeight: 29, color: c.ink },
  foot: { marginTop: space(2) },
});

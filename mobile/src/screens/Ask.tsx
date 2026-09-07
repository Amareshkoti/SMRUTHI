import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { c, font, space } from '../theme';
import { LanguagePicker, Notice } from '../components/Chrome';
import { api, type ChatTurn, type Fact, type Language } from '../api';
import type { StoredMessage } from '../db';
import { loadLocalChats, saveLocalChats, type LocalChat } from '../chatStorage';

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
  userId,
  onChanged,
}: {
  facts: Fact[];
  language: Language;
  onLanguage: (l: Language) => void;
  userId: string;
  /** Refreshes report counts elsewhere in the app. Chats stay on this device. */
  onChanged?: () => void;
}) {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [chats, setChats] = useState<LocalChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);

  // Chats are private to this device and are never sent to Supabase.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const local = await loadLocalChats(userId);
        if (cancelled) return;
        if (local.length) {
          setChats(local);
          setActiveChatId((current) => current && local.some(c => c.id === current) ? current : local[0]!.id);
        } else {
          const now = new Date().toISOString();
          const first: LocalChat = { id: `${Date.now()}`, title: 'New chat', createdAt: now, updatedAt: now, messages: [] };
          await saveLocalChats(userId, [first]);
          if (!cancelled) { setChats([first]); setActiveChatId(first.id); }
        }
      } catch {
        setError('Your chats could not be loaded. Please check your connection.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    setMessages(chats.find(c => c.id === activeChatId)?.messages ?? []);
  }, [activeChatId, chats]);

  async function newChat() {
    try {
      const now = new Date().toISOString();
      const chat: LocalChat = { id: `${Date.now()}`, title: 'New chat', createdAt: now, updatedAt: now, messages: [] };
      const next = [chat, ...chats];
      await saveLocalChats(userId, next);
      setChats(next);
      setActiveChatId(chat.id);
      setMessages([]);
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start a new chat.'); }
  }

  async function removeChat() {
    if (!activeChatId) return;
    try {
      const remaining = chats.filter(c => c.id !== activeChatId);
      // Never leave activeChatId null -- ask() no-ops without one, and that
      // silence looked like the app had stopped working until it was reopened.
      const now = new Date().toISOString();
      const next = remaining.length ? remaining : [{ id: `${Date.now()}`, title: 'New chat', createdAt: now, updatedAt: now, messages: [] }];
      await saveLocalChats(userId, next);
      setChats(next);
      setActiveChatId(next[0]!.id);
      setMessages(next[0]!.messages);
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete this chat.'); }
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy || !activeChatId) return;
    setBusy(true);
    setError(null);
    setQuestion('');

    // The turns the model gets are the ones already on screen -- not this one.
    const history: ChatTurn[] = messages.map((m) => ({ role: m.role, text: m.text }));

    // Everything that can fail stays inside the try: a write that throws out
    // here would leave the screen stuck on "Thinking..." with nothing to show
    // for it.
    try {
      const now = new Date().toISOString();
      const mine: StoredMessage = { id: `${Date.now()}-user`, conversationId: activeChatId, role: 'user', text, language, createdAt: now };
      const withMine = [...messages, mine];
      setMessages(withMine);
      onChanged?.();

      const res = await api.ask(text, facts, language, history);
      const theirs: StoredMessage = { id: `${Date.now()}-assistant`, conversationId: activeChatId, role: 'assistant', text: res.answer, language, createdAt: new Date().toISOString() };
      const withAnswer = [...withMine, theirs];
      setMessages(withAnswer);
      const nextChats = chats.map(chat => chat.id === activeChatId ? { ...chat, title: chat.title === 'New chat' ? text.slice(0, 36) : chat.title, updatedAt: theirs.createdAt, messages: withAnswer } : chat);
      setChats(nextChats);
      await saveLocalChats(userId, nextChats);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer that.');
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;
  const lastAnswerId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scroller}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.label}>ASK</Text>
            <Pressable onPress={newChat} hitSlop={10} accessibilityRole="button"><Text style={styles.clear}>New chat</Text></Pressable>
          </View>
          <Text style={styles.title}>In the language{'\n'}you think in.</Text>
        </View>

        <View style={styles.langSlot}>
          <LanguagePicker value={language} onChange={onLanguage} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chatTabs}>
          {chats.map((chat) => (
            <Pressable key={chat.id} onPress={() => setActiveChatId(chat.id)} style={[styles.chatTab, chat.id === activeChatId && styles.chatTabOn]}>
              <Text numberOfLines={1} style={[styles.chatTabText, chat.id === activeChatId && styles.chatTabTextOn]}>{chat.title}</Text>
            </Pressable>
          ))}
          {activeChatId ? <Pressable onPress={removeChat} style={styles.deleteChat}><Text style={styles.deleteChatText}>Delete chat</Text></Pressable> : null}
        </ScrollView>

        {messages.map((m) =>
          m.role === 'user' ? (
            <View key={m.id} style={styles.askedRow}>
              <View style={styles.askedBubble}>
                <Text style={styles.askedText}>{m.text}</Text>
              </View>
            </View>
          ) : (
            <View key={m.id} style={styles.answerBubble}>
              <Text style={styles.answerText}>{m.text}</Text>
              {m.id === lastAnswerId && (
                <Text style={styles.answerFoot}>
                  Draws on your {facts.length} remembered results, and general medical knowledge when needed.
                </Text>
              )}
            </View>
          ),
        )}

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

        {empty ? (
          <>
            <Text style={styles.tryLabel}>TRY</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS[language].map((s) => (
                <Pressable key={s} onPress={() => ask(s)} disabled={busy} style={styles.suggestion}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Pinned outside the scroller so the keyboard can never hide what you type. */}
      <View style={styles.inputRow}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask about your reports"
          placeholderTextColor={c.textFaint}
          style={styles.input}
          editable={!busy}
          multiline
          submitBehavior="submit"
          onSubmitEditing={() => ask(question)}
        />
        <Pressable onPress={() => ask(question)} disabled={busy || !question.trim()} style={styles.send}>
          <Text style={styles.sendArrow}>→</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.ink },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: space(2) },

  header: { paddingHorizontal: space(3), paddingTop: space(1.25) },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.textFaint },
  clear: { fontFamily: font.bodyMedium, fontSize: 12, color: c.textFaint },
  title: { fontFamily: font.display, fontSize: 38, lineHeight: 44, color: c.text, marginTop: space(1.25) },

  langSlot: { marginHorizontal: space(3), marginTop: space(2.5) },
  chatTabs: { paddingHorizontal: space(3), gap: space(1), marginTop: space(2) },
  chatTab: { maxWidth: 150, borderRadius: 14, borderWidth: 1, borderColor: c.hairSoft, paddingVertical: space(1), paddingHorizontal: space(1.5) },
  chatTabOn: { borderColor: c.gold, backgroundColor: c.goldWash },
  chatTabText: { fontFamily: font.bodyMedium, fontSize: 12, color: c.textFaint },
  chatTabTextOn: { color: c.gold },
  deleteChat: { justifyContent: 'center', paddingHorizontal: space(1) },
  deleteChatText: { fontFamily: font.bodyMedium, fontSize: 12, color: c.rose },

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
    flexDirection: 'row', alignItems: 'flex-end', gap: space(1.25), marginTop: space(1), marginHorizontal: space(3), marginBottom: space(1),
    borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairSoft, paddingVertical: space(1.5), paddingLeft: space(2), paddingRight: space(1.5),
  },
  input: { flex: 1, color: c.text, fontSize: 15, fontFamily: font.body, paddingVertical: space(1), maxHeight: 120 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  sendArrow: { color: c.ink, fontSize: 16 },
});

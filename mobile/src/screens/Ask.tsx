import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { c, font, space } from '../theme';
import { LanguagePicker, Notice } from '../components/Chrome';
import { VoiceCallButton } from '../components/VoiceCallButton';
import { api, type ChatTurn, type Fact, type Language } from '../api';
import type { StoredDocument, StoredMessage } from '../db';
import { loadLocalChats, saveLocalChats, type LocalChat } from '../chatStorage';
import type { FamilyProfile } from '../family';
import type { EphemeralChatContext } from '../ephemeralChat';

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
  documents,
  family,
  language,
  onLanguage,
  userId,
  onChanged,
  ephemeral,
  onEphemeralConsumed,
}: {
  facts: Fact[];
  documents: StoredDocument[];
  family: FamilyProfile[];
  language: Language;
  onLanguage: (l: Language) => void;
  userId: string;
  /** Refreshes report counts elsewhere in the app. Chats stay on this device. */
  onChanged?: () => void;
  /** An on-device screening (pulse/face) to chat about once, right now. */
  ephemeral?: EphemeralChatContext | null;
  /** Called once the screening above has been picked up, so it isn't offered again. */
  onEphemeralConsumed?: () => void;
}) {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [chats, setChats] = useState<LocalChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);

  // A screening someone asked to chat about. Kept only in this component's
  // state -- never written to chatStorage or the SQLite cache -- and thrown
  // away the moment it's dismissed or this screen unmounts.
  const [activeEphemeral, setActiveEphemeral] = useState<EphemeralChatContext | null>(null);
  const [ephemeralMessages, setEphemeralMessages] = useState<StoredMessage[]>([]);

  useEffect(() => {
    if (!ephemeral) return;
    setActiveEphemeral(ephemeral);
    setEphemeralMessages([]);
    setError(null);
    onEphemeralConsumed?.();
    // Only react to a new screening arriving, not to the callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ephemeral]);

  function endEphemeral() {
    setActiveEphemeral(null);
    setEphemeralMessages([]);
    setError(null);
  }

  // Which document each fact came from belongs to, so a person's chat only
  // ever sees their own readings.
  const docOwner = new Map(documents.map(d => [d.id, d.person_id]));
  const scopedFacts = facts.filter(f => (docOwner.get(f.docId ?? '') ?? null) === selectedPersonId);
  const personName = selectedPersonId ? family.find(m => m.id === selectedPersonId)?.displayName ?? 'them' : 'you';
  const visibleChats = chats.filter(chat => (chat.personId ?? null) === selectedPersonId);

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
          const first: LocalChat = { id: `${Date.now()}`, title: 'New chat', personId: null, createdAt: now, updatedAt: now, messages: [] };
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

  // Keep the active chat pointed at one that belongs to whoever is selected;
  // start a fresh chat for them if they don't have one yet.
  useEffect(() => {
    if (visibleChats.some(c => c.id === activeChatId)) return;
    if (visibleChats.length) {
      setActiveChatId(visibleChats[0]!.id);
      return;
    }
    // No chat for this person yet, and no room to start one without deleting
    // another -- clear the selection rather than silently reusing a chat that
    // belongs to someone else.
    if (chats.length >= 3) { setActiveChatId(null); return; }
    (async () => {
      try {
        const now = new Date().toISOString();
        const chat: LocalChat = { id: `${Date.now()}`, title: 'New chat', personId: selectedPersonId, createdAt: now, updatedAt: now, messages: [] };
        const next = [chat, ...chats];
        await saveLocalChats(userId, next);
        setChats(next);
        setActiveChatId(chat.id);
      } catch { /* the chip stays selected; the user can retry by tapping it again */ }
    })();
  }, [selectedPersonId, chats, visibleChats, activeChatId, userId]);

  async function newChat() {
    if (chats.length >= 3) {
      setError('You can keep up to 3 chats. Delete one before starting another.');
      return;
    }
    try {
      const now = new Date().toISOString();
      const chat: LocalChat = { id: `${Date.now()}`, title: 'New chat', personId: selectedPersonId, createdAt: now, updatedAt: now, messages: [] };
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
      const remainingForPerson = remaining.filter(c => (c.personId ?? null) === selectedPersonId);
      // Never leave activeChatId null -- ask() no-ops without one, and that
      // silence looked like the app had stopped working until it was reopened.
      const now = new Date().toISOString();
      const fallback: LocalChat = { id: `${Date.now()}`, title: 'New chat', personId: selectedPersonId, createdAt: now, updatedAt: now, messages: [] };
      const next = remainingForPerson.length ? remaining : [...remaining, fallback];
      const active = remainingForPerson[0] ?? fallback;
      await saveLocalChats(userId, next);
      setChats(next);
      setActiveChatId(active.id);
      setMessages(active.messages);
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete this chat.'); }
  }

  // Nothing here ever reaches saveLocalChats or the SQLite cache -- this
  // conversation exists only in this component's state.
  async function askEphemeral(text: string) {
    if (!activeEphemeral) return;
    setBusy(true);
    setError(null);
    setQuestion('');

    const history: ChatTurn[] = ephemeralMessages.map((m) => ({ role: m.role, text: m.text }));

    try {
      const now = new Date().toISOString();
      const mine: StoredMessage = { id: `${Date.now()}-user`, conversationId: 'ephemeral', role: 'user', text, language, createdAt: now };
      const withMine = [...ephemeralMessages, mine];
      setEphemeralMessages(withMine);

      const res = await api.ask(text, activeEphemeral.facts, language, history, activeEphemeral.extraContext, activeEphemeral.mode);
      const theirs: StoredMessage = { id: `${Date.now()}-assistant`, conversationId: 'ephemeral', role: 'assistant', text: res.answer, language, createdAt: new Date().toISOString() };
      setEphemeralMessages([...withMine, theirs]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer that.');
    } finally {
      setBusy(false);
    }
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    if (activeEphemeral) return askEphemeral(text);
    if (!activeChatId) return;
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

      const res = await api.ask(text, scopedFacts, language, history);
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

  const displayMessages = activeEphemeral ? ephemeralMessages : messages;
  const empty = displayMessages.length === 0;
  const lastAnswerId = [...displayMessages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <View style={styles.root}>
      <View style={styles.voiceDock}><VoiceCallButton facts={activeEphemeral ? activeEphemeral.facts : scopedFacts} language={language} /></View>
      <ScrollView
        ref={scroller}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}><Text style={styles.label}>ASK</Text></View>
          <Text style={styles.title}>In the language{'\n'}you think in.</Text>
        </View>

        <View style={styles.langSlot}>
          <LanguagePicker value={language} onChange={onLanguage} />
        </View>

        {activeEphemeral ? (
          <View style={styles.ephemeralBanner}>
            <View style={styles.ephemeralBannerHead}>
              <View style={styles.ephemeralDot} />
              <Text style={styles.ephemeralTitle}>CHATTING ABOUT · {activeEphemeral.label.toUpperCase()}</Text>
            </View>
            <Text style={styles.ephemeralDesc}>
              Not saved -- this conversation and the screening it's about will be gone once you leave this screen.
            </Text>
            <Pressable onPress={endEphemeral} style={styles.ephemeralDone}>
              <Text style={styles.ephemeralDoneText}>Done with this chat</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {family.length ? (
              <View style={styles.personSlot}>
                <Text style={styles.personLabel}>CHATTING ABOUT</Text>
                <View style={styles.personChoices}>
                  <Pressable onPress={() => setSelectedPersonId(null)} style={[styles.person, !selectedPersonId && styles.personOn]}>
                    <Text style={[styles.personText, !selectedPersonId && styles.personTextOn]}>Me</Text>
                  </Pressable>
                  {family.map(member => (
                    <Pressable key={member.id} onPress={() => setSelectedPersonId(member.id)} style={[styles.person, selectedPersonId === member.id && styles.personOn]}>
                      <Text style={[styles.personText, selectedPersonId === member.id && styles.personTextOn]}>{member.displayName}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {visibleChats.length || chats.length < 3 ? (
              <View style={styles.chatTabs}>
                {visibleChats.map((chat) => (
                  <Pressable key={chat.id} onPress={() => setActiveChatId(chat.id)} style={[styles.chatTab, chat.id === activeChatId && styles.chatTabOn]}>
                    <Text numberOfLines={1} style={[styles.chatTabText, chat.id === activeChatId && styles.chatTabTextOn]}>{chat.title}</Text>
                  </Pressable>
                ))}
                {activeChatId ? <Pressable onPress={removeChat} style={styles.deleteChat}><Text style={styles.deleteChatText}>Delete chat</Text></Pressable> : null}
                {chats.length < 3 ? <Pressable onPress={newChat} style={styles.newChat}><Text style={styles.newChatText}>+ Chat</Text></Pressable> : null}
              </View>
            ) : (
              <View style={styles.slot}>
                <Notice text={`You can keep up to 3 chats. Delete one (for any person) to start chatting with ${personName === 'you' ? 'your own records' : personName}.`} tone="error" />
              </View>
            )}
          </>
        )}

        {displayMessages.map((m) =>
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
                  {activeEphemeral
                    ? `Draws on this session's ${activeEphemeral.label.toLowerCase()}, and general medical knowledge when needed.`
                    : `Draws on ${scopedFacts.length} remembered results for ${personName}, and general medical knowledge when needed.`}
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

        {empty && !activeEphemeral ? (
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
          placeholder={activeEphemeral ? `Ask about this ${activeEphemeral.label.toLowerCase()}` : 'Ask about your reports'}
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
  voiceDock: { backgroundColor: c.ink, zIndex: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: space(2) },

  header: { paddingHorizontal: space(3), paddingTop: space(1.25) },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.textFaint },
  clear: { fontFamily: font.bodyMedium, fontSize: 12, color: c.textFaint },
  title: { fontFamily: font.display, fontSize: 38, lineHeight: 44, color: c.text, marginTop: space(1.25) },

  langSlot: { marginHorizontal: space(3), marginTop: space(2.5) },

  ephemeralBanner: {
    marginHorizontal: space(3), marginTop: space(2), borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(127,195,165,.3)', backgroundColor: 'rgba(127,195,165,.08)', padding: space(2),
  },
  ephemeralBannerHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ephemeralDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.mint },
  ephemeralTitle: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.8, color: c.mint },
  ephemeralDesc: { fontFamily: font.body, fontSize: 12, lineHeight: 18, color: c.textSoft, marginTop: 4 },
  ephemeralDone: { marginTop: space(1.25), alignSelf: 'flex-start' },
  ephemeralDoneText: { fontFamily: font.bodyMedium, fontSize: 12, color: c.gold },

  personSlot: { marginHorizontal: space(3), marginTop: space(2) },
  personLabel: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.4, color: c.textFaint, marginBottom: space(1) },
  personChoices: { flexDirection: 'row', gap: space(1), flexWrap: 'wrap' },
  person: { borderRadius: 12, borderWidth: 1, borderColor: c.hairSoft, paddingHorizontal: space(1.5), paddingVertical: space(0.9) },
  personOn: { borderColor: c.gold, backgroundColor: c.goldWash },
  personText: { fontFamily: font.bodyMedium, fontSize: 12, color: c.textMuted },
  personTextOn: { color: c.gold },

  chatTabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(3), gap: space(1), marginTop: space(2) },
  chatTab: { flex: 1, minWidth: 0, borderRadius: 14, borderWidth: 1, borderColor: c.hairSoft, paddingVertical: space(1), paddingHorizontal: space(1.5) },
  chatTabOn: { borderColor: c.gold, backgroundColor: c.goldWash },
  chatTabText: { fontFamily: font.bodyMedium, fontSize: 12, color: c.textFaint },
  chatTabTextOn: { color: c.gold },
  deleteChat: { justifyContent: 'center', paddingHorizontal: space(1) },
  deleteChatText: { fontFamily: font.bodyMedium, fontSize: 12, color: c.rose },
  newChat: { justifyContent: 'center', paddingHorizontal: space(1) },
  newChatText: { fontFamily: font.bodyMedium, fontSize: 12, color: c.gold },

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

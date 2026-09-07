import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View, Platform, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';
import { c, fontsToLoad } from './src/theme';
import { BottomNav, useKeyboardVisible, type View5 } from './src/components/Chrome';
import { HomeScreen } from './src/screens/Home';
import { SignalScreen } from './src/screens/Signal';
import { MemoryScreen } from './src/screens/Timeline';
import { AskScreen } from './src/screens/Ask';
import { PrivacyScreen } from './src/screens/Privacy';
import { SignInScreen } from './src/screens/SignIn';
import { AddReportSheet } from './src/components/AddReportSheet';
import { WipeSheet } from './src/components/WipeSheet';
import { cacheReports, clearCache, listDocuments, listFacts, storageSummary, type StoredDocument } from './src/db';
import { fetchDocuments, fetchFacts } from './src/remote';
import { api, formatWarning, isSafeWarningMessage, type Fact, type Insight, type Language } from './src/api';
import { useSession } from './src/useSession';
import { supabase } from './src/supabase';
import { clearLocalChats } from './src/chatStorage';

export default function App() {
  const [fontsLoaded] = useFonts(fontsToLoad);
  const { userId, email, loading: sessionLoading } = useSession();

  const [view, setView] = useState<View5>('home');
  const [selectedAnalyte, setSelectedAnalyte] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [language, setLanguage] = useState<Language>('en');
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [summary, setSummary] = useState({ documents: 0, facts: 0, messages: 0, bytes: 0 });
  const [offline, setOffline] = useState(false);

  const [insights, setInsights] = useState<Insight[]>([]);
  const [warning, setWarning] = useState<{ insight: Insight; message: string | null } | null>(null);
  const [phrasing, setPhrasing] = useState(false);

  /**
   * Supabase is the truth; the local database is a mirror we fall back to.
   * Read the cache first so the screen fills immediately, then reconcile. If
   * the network is gone we keep showing the cache and say so, rather than
   * presenting an empty app as though the user had no records.
   */
  const refresh = useCallback(async () => {
    if (!userId) {
      setDocuments([]);
      setFacts([]);
      setSummary({ documents: 0, facts: 0, messages: 0, bytes: 0 });
      return;
    }

    const [cachedDocs, cachedFacts] = await Promise.all([listDocuments(userId), listFacts(userId)]);
    setDocuments(cachedDocs);
    setFacts(cachedFacts);

    let remoteLoaded = false;
    try {
      const [docs, allFacts] = await Promise.all([fetchDocuments(), fetchFacts()]);
      await cacheReports(userId, docs, allFacts);
      setDocuments(docs);
      setFacts(allFacts);
      setSummary({ documents: docs.length, facts: allFacts.length, messages: 0, bytes: 0 });
      remoteLoaded = true;
      setOffline(false);
    } catch {
      // Cache is already on screen. Do not blank it out.
      setOffline(true);
    }

    if (!remoteLoaded) setSummary(await storageSummary(userId));
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    if (facts.length === 0) {
      setInsights([]);
      setWarning(null);
      return;
    }
    (async () => {
      try {
        const { insights: found } = await api.insights(facts);
        if (cancelled) return;
        setInsights(found);

        const top = found.find((i) => i.severity === 'warning');
        if (!top) {
          setWarning(null);
          return;
        }
        setWarning({ insight: top, message: null });
        setPhrasing(true);
        const phrased = await api.warning(facts, language);
        if (!cancelled && phrased.insight) {
          setWarning({
            insight: phrased.insight,
            message: isSafeWarningMessage(phrased.message) ? phrased.message : formatWarning(phrased.insight),
          });
        }
      } catch {
        // Home/Signal fall back to the computed statement when phrasing fails.
      } finally {
        if (!cancelled) setPhrasing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facts, language]);

  const focusedInsight =
    insights.find((i) => i.analyte === selectedAnalyte) ?? warning?.insight ?? insights[0] ?? null;

  useEffect(() => {
    if (view === 'signal' && !focusedInsight) setView('home');
  }, [view, focusedInsight]);

  const keyboardUp = useKeyboardVisible();

  async function signOut() {
    // Clear this account's mirror before dropping the session: the next person
    // to open the app on this phone must not see the last one's results.
    if (userId) await clearCache(userId);
    if (userId) await clearLocalChats(userId);
    setDocuments([]);
    setFacts([]);
    setInsights([]);
    setWarning(null);
    setNote(null);
    setView('home');
    await supabase.auth.signOut();
  }

  if (!fontsLoaded || sessionLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={c.ink} />
        <View style={styles.loading}>
          {fontsLoaded ? <ActivityIndicator color={c.gold} /> : null}
        </View>
      </SafeAreaView>
    );
  }

  if (!userId) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={c.ink} />
        <SignInScreen />
      </SafeAreaView>
    );
  }

  function openSignal(analyte: string) {
    setSelectedAnalyte(analyte);
    setView('signal');
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={c.ink} />
      {/*
        Android is edge-to-edge from SDK 54 on, so the window no longer shrinks
        for the keyboard by itself -- without this, anything pinned to the
        bottom (the Ask composer) ends up underneath it. Expo's guidance: give
        iOS "padding", and on Android the component alone is enough.
      */}
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          {view === 'home' && (
            <HomeScreen
              documents={documents}
              facts={facts}
              insights={insights}
              warning={warning}
              phrasing={phrasing}
              language={language}
              onLanguage={setLanguage}
              onOpenSignal={openSignal}
              onOpenVault={() => setView('vault')}
            />
          )}
          {view === 'signal' && focusedInsight && (
            <SignalScreen key={focusedInsight.analyte} insight={focusedInsight} onBack={() => setView('home')} />
          )}
          {view === 'memory' && <MemoryScreen documents={documents} facts={facts} note={note} />}
          {view === 'ask' && (
            <AskScreen
              facts={facts}
              language={language}
              onLanguage={setLanguage}
              userId={userId}
              onChanged={() => void refresh()}
            />
          )}
          {view === 'vault' && (
            <PrivacyScreen
              summary={summary}
              email={email}
              offline={offline}
              onBack={() => setView('home')}
              onAskWipe={() => setWipeOpen(true)}
              onSignOut={() => void signOut()}
            />
          )}
        </View>

        {view !== 'signal' && !keyboardUp && (
          <BottomNav active={view} onChange={setView} onAdd={() => setSheetOpen(true)} />
        )}
      </KeyboardAvoidingView>

      <AddReportSheet
        open={sheetOpen}
        userId={userId}
        onClose={() => setSheetOpen(false)}
        onSaved={(msg) => {
          setNote(msg);
          void refresh();
        }}
      />
      <WipeSheet
        open={wipeOpen}
        userId={userId}
        onClose={() => setWipeOpen(false)}
        onWiped={() => {
          setNote(null);
          setView('home');
          void refresh();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c.ink,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  body: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View, Text, Platform, KeyboardAvoidingView, ActivityIndicator, BackHandler } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { c, fontsToLoad } from './src/theme';
import { BottomNav, useKeyboardVisible, type View5 } from './src/components/Chrome';
import { HomeScreen } from './src/screens/Home';
import { SignalScreen } from './src/screens/Signal';
import { MemoryScreen } from './src/screens/Timeline';
import { AskScreen } from './src/screens/Ask';
import { PrivacyScreen } from './src/screens/Privacy';
import { FamilyScreen } from './src/screens/Family';
import { ReportProcessingOverlay } from './src/components/ReportProcessingOverlay';
import { SignInScreen } from './src/screens/SignIn';
import { AddReportSheet } from './src/components/AddReportSheet';
import { WipeSheet } from './src/components/WipeSheet';
import { cacheReports, clearCache, listDocuments, listFacts, storageSummary, type StoredDocument } from './src/db';
import { fetchDocuments, fetchFacts } from './src/remote';
import { api, formatWarning, isSafeWarningMessage, type Fact, type Insight, type Language } from './src/api';
import { useSession } from './src/useSession';
import { supabase } from './src/supabase';
import { clearLocalChats } from './src/chatStorage';
import { detectLocalTrends } from './src/trendAnalysis';
import { useUploadJob } from './src/uploadJob';
import { reportTools } from './modules/report-tools';
import { fetchFamily, type FamilyProfile } from './src/family';
import type { EphemeralChatContext } from './src/ephemeralChat';

type SharedReport = { uri: string; name: string; mimeType: string; size: number };

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

function AppInner() {
  const [fontsLoaded] = useFonts(fontsToLoad);
  const { userId, email, loading: sessionLoading } = useSession();

  const [view, setView] = useState<View5>('home');
  const [selectedAnalyte, setSelectedAnalyte] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sharedReport, setSharedReport] = useState<SharedReport | null>(null);
  const [family, setFamily] = useState<FamilyProfile[]>([]);
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
  const uploadJob = useUploadJob();

  // A pending on-device screening (pulse/face) to chat about. Lives only in
  // memory -- never written to chatStorage or the SQLite cache -- and is
  // cleared the moment the Ask screen has picked it up.
  const [ephemeral, setEphemeral] = useState<EphemeralChatContext | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // If SMRUTI was opened from another application's share sheet, put that
    // selected report into the normal review screen instead of asking again.
    // reportTools() throws synchronously (not via the promise) when the native
    // module isn't present in this build -- e.g. Expo Go or an older APK --
    // so it needs its own try/catch rather than relying on .catch() below.
    let tools: ReturnType<typeof reportTools>;
    try {
      tools = reportTools();
    } catch {
      return;
    }
    void tools.sharedFile().then((file) => {
      if (!file) return;
      setSharedReport({ ...file, size: 0 });
      setSheetOpen(true);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!uploadJob || uploadJob.busy || !uploadJob.completed) return;
    setNote(uploadJob.text);
    void refresh();
  }, [uploadJob?.completed]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (wipeOpen) { setWipeOpen(false); return true; }
      if (sheetOpen) { setSheetOpen(false); return true; }
      if (view !== 'home') { setView('home'); setSelectedAnalyte(null); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [sheetOpen, view, wipeOpen]);

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

  const refreshFamily = useCallback(async () => {
    if (!userId) { setFamily([]); return; }
    try { setFamily(await fetchFamily()); } catch { setFamily([]); }
  }, [userId]);

  useEffect(() => { void refreshFamily(); }, [refreshFamily]);

  useEffect(() => {
    let cancelled = false;
    if (facts.length === 0) {
      setInsights([]);
      setWarning(null);
      return;
    }
    (async () => {
      try {
        const local = detectLocalTrends(facts);
        setInsights(local);
        let found = local;
        try {
          const response = await api.insights(facts);
          if (cancelled) return;
          found = response.insights.length ? response.insights : local;
          setInsights(found);
        } catch {
          // The report data is already available; keep the local computation.
        }
        if (cancelled) return;

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
    setEphemeral(null);
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
        for the keyboard by itself -- without a "behavior", KeyboardAvoidingView
        does nothing at all on Android, and anything pinned to the bottom (the
        Ask composer) ends up underneath the keyboard. "height" is the manual
        replacement for the resize the OS used to do for us.
      */}
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
              onOpenAsk={(ctx) => { if (ctx) setEphemeral(ctx); setView('ask'); }}
            />
          )}
          {view === 'signal' && focusedInsight && (
            <SignalScreen key={focusedInsight.analyte} insight={focusedInsight} onBack={() => setView('home')} />
          )}
          {view === 'memory' && <MemoryScreen documents={documents} facts={facts} note={note} />}
          {view === 'ask' && (
            <AskScreen
              facts={facts}
              documents={documents}
              family={family}
              language={language}
              onLanguage={setLanguage}
              userId={userId}
              onChanged={() => void refresh()}
              ephemeral={ephemeral}
              onEphemeralConsumed={() => setEphemeral(null)}
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
              onFamily={() => setView('family')}
            />
          )}
          {view === 'family' && <FamilyScreen onBack={() => setView('vault')} onChanged={() => void refreshFamily()} />}
        </View>
        {uploadJob?.busy ? <ReportProcessingOverlay text={uploadJob.text} /> : null}

        {view !== 'signal' && !keyboardUp && (
          <BottomNav active={view} onChange={setView} onAdd={() => setSheetOpen(true)} />
        )}
      </KeyboardAvoidingView>

      <AddReportSheet
        open={sheetOpen}
        userId={userId}
        sharedFile={sharedReport}
        family={family}
        onClose={() => { setSheetOpen(false); setSharedReport(null); }}
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
  },
  body: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View, Platform } from 'react-native';
import { useFonts } from 'expo-font';
import { c, fontsToLoad } from './src/theme';
import { BottomNav, type View5 } from './src/components/Chrome';
import { HomeScreen } from './src/screens/Home';
import { SignalScreen } from './src/screens/Signal';
import { MemoryScreen } from './src/screens/Timeline';
import { AskScreen } from './src/screens/Ask';
import { PrivacyScreen } from './src/screens/Privacy';
import { AddReportSheet } from './src/components/AddReportSheet';
import { WipeSheet } from './src/components/WipeSheet';
import { listDocuments, listFacts, storageSummary, type StoredDocument } from './src/db';
import { api, type Fact, type Insight, type Language } from './src/api';

export default function App() {
  const [fontsLoaded] = useFonts(fontsToLoad);

  const [view, setView] = useState<View5>('home');
  const [selectedAnalyte, setSelectedAnalyte] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [language, setLanguage] = useState<Language>('en');
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [summary, setSummary] = useState({ documents: 0, facts: 0, bytes: 0 });

  const [insights, setInsights] = useState<Insight[]>([]);
  const [warning, setWarning] = useState<{ insight: Insight; message: string | null } | null>(null);
  const [phrasing, setPhrasing] = useState(false);

  const refresh = useCallback(async () => {
    const [docs, allFacts, sum] = await Promise.all([listDocuments(), listFacts(), storageSummary()]);
    setDocuments(docs);
    setFacts(allFacts);
    setSummary(sum);
  }, []);

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
          setWarning({ insight: phrased.insight, message: phrased.message });
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

  if (!fontsLoaded) return null;

  function openSignal(analyte: string) {
    setSelectedAnalyte(analyte);
    setView('signal');
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={c.ink} />
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
        {view === 'ask' && <AskScreen facts={facts} language={language} onLanguage={setLanguage} />}
        {view === 'vault' && (
          <PrivacyScreen summary={summary} onBack={() => setView('home')} onAskWipe={() => setWipeOpen(true)} />
        )}
      </View>

      {view !== 'signal' && (
        <BottomNav active={view} onChange={setView} onAdd={() => setSheetOpen(true)} />
      )}

      <AddReportSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={(msg) => {
          setNote(msg);
          void refresh();
        }}
      />
      <WipeSheet
        open={wipeOpen}
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
});

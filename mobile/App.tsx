import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View, Platform } from 'react-native';
import { c } from './src/theme';
import { TabBar, type Tab } from './src/components/Chrome';
import { TimelineScreen } from './src/screens/Timeline';
import { TrendsScreen } from './src/screens/Trends';
import { AskScreen } from './src/screens/Ask';
import { PrivacyScreen } from './src/screens/Privacy';
import { listDocuments, listFacts, storageSummary, type StoredDocument } from './src/db';
import type { Fact, Language } from './src/api';

export default function App() {
  const [tab, setTab] = useState<Tab>('timeline');
  const [language, setLanguage] = useState<Language>('en');
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [summary, setSummary] = useState({ documents: 0, facts: 0, bytes: 0 });

  const refresh = useCallback(async () => {
    const [docs, allFacts, sum] = await Promise.all([listDocuments(), listFacts(), storageSummary()]);
    setDocuments(docs);
    setFacts(allFacts);
    setSummary(sum);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={c.paper} />
      <View style={styles.body}>
        {tab === 'timeline' && <TimelineScreen documents={documents} onChanged={refresh} />}
        {tab === 'trends' && (
          <TrendsScreen facts={facts} language={language} onLanguage={setLanguage} />
        )}
        {tab === 'ask' && <AskScreen facts={facts} language={language} onLanguage={setLanguage} />}
        {tab === 'privacy' && <PrivacyScreen summary={summary} onWiped={refresh} />}
      </View>
      <TabBar active={tab} onChange={setTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c.paper,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  body: { flex: 1 },
});

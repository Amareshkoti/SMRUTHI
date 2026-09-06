import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { c, font, space } from '../theme';
import { Screen, BackHeader, Button } from '../components/Chrome';
import { API_BASE } from '../api';

export function PrivacyScreen({
  summary,
  onBack,
  onAskWipe,
}: {
  summary: { documents: number; facts: number; bytes: number };
  onBack: () => void;
  onAskWipe: () => void;
}) {
  return (
    <Screen>
      <BackHeader onBack={onBack} label="YOURS" />
      <Text style={styles.title}>What this app{'\n'}holds, and cannot.</Text>

      <View style={styles.statsRow}>
        <Stat value={String(summary.facts)} label="results stored" />
        <Stat value={summary.bytes < 1024 ? `${summary.bytes} B` : `${(summary.bytes / 1024).toFixed(1)} KB`} label="space they take" />
        <Stat value="0" label="copies elsewhere" />
      </View>

      <View style={styles.sections}>
        <Section title="On this phone" body="Your results live in a database on this device. Nothing syncs anywhere. Uninstall the app and they are gone." />
        <Section
          title="What the server saw"
          body={`Your file passed through ${API_BASE}, was read once, and was never written to disk. If the server were broken into tomorrow there would be nothing of yours to take.`}
        />
        <Section title="Your originals" body="Every scan is still in your own Google Drive. This app keeps what it understood, never the paper." />
        <Section title="What we do not do yet" body="The database on this phone is not encrypted at rest. Saying so is better than implying a protection you do not have." />
      </View>

      <View style={styles.wipeSlot}>
        <Button label="Forget everything" onPress={onAskWipe} disabled={summary.facts === 0} tone="dangerOutline" />
      </View>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 38, lineHeight: 44, color: c.text, marginTop: space(2.25), marginHorizontal: space(3) },

  statsRow: { flexDirection: 'row', gap: space(1.25), marginTop: space(3), marginHorizontal: space(3) },
  stat: { flex: 1, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hair, paddingVertical: space(2), paddingHorizontal: space(1.75) },
  statValue: { fontFamily: font.displayRegular, fontSize: 24, color: c.text },
  statLabel: { fontFamily: font.body, fontSize: 11, color: c.textFaint, marginTop: 2 },

  sections: { marginTop: space(3.5), marginHorizontal: space(3), gap: space(2.75) },
  section: {},
  sectionTitle: { fontFamily: font.displayRegular, fontSize: 21, color: c.text },
  sectionBody: { fontFamily: font.body, fontSize: 14, lineHeight: 23, color: c.textMuted, marginTop: space(0.75) },

  wipeSlot: { marginTop: space(4), marginHorizontal: space(3) },
});

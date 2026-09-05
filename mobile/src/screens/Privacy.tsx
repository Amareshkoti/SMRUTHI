import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { c, font, space, type } from '../theme';
import { Screen, Button } from '../components/Chrome';
import { API_BASE } from '../api';
import { wipeEverything } from '../db';

/**
 * Every claim on this screen is checkable against the code, which is the point.
 * A privacy screen that only asserts things is worth nothing.
 */
export function PrivacyScreen({
  summary,
  onWiped,
}: {
  summary: { documents: number; facts: number; bytes: number };
  onWiped: () => void;
}) {
  const [wiping, setWiping] = useState(false);

  function confirmWipe() {
    Alert.alert(
      'Forget everything?',
      'This erases every result stored on this phone. Your files in Google Drive are not touched.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Forget everything',
          style: 'destructive',
          onPress: async () => {
            setWiping(true);
            try {
              await wipeEverything();
              onWiped();
            } finally {
              setWiping(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen title="Yours" subtitle="What this app holds, and what it cannot.">
      <View style={styles.figures}>
        <Figure value={String(summary.documents)} label="reports remembered" />
        <Figure value={String(summary.facts)} label="results stored" />
        <Figure
          value={summary.bytes < 1024 ? `${summary.bytes} B` : `${(summary.bytes / 1024).toFixed(1)} KB`}
          label="space they take"
        />
      </View>

      <View style={styles.section}>
        <Text style={type.title}>On this phone</Text>
        <Text style={styles.p}>
          Your results live in a database on this device. Nothing syncs anywhere. If you uninstall
          the app, they are gone.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={type.title}>What the server saw</Text>
        <Text style={styles.p}>
          Your file went from Google Drive through the server at {API_BASE}, was read once, and was
          never written to disk. Nothing about you is stored there. If it were broken into tomorrow,
          there would be nothing of yours to take.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={type.title}>Your originals</Text>
        <Text style={styles.p}>
          Every scan and PDF is still in your own Google Drive, exactly where you put it. This app
          keeps only what it understood, never the paper itself.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={type.title}>What we do not do yet</Text>
        <Text style={styles.p}>
          The database on this phone is not encrypted at rest. Doing that properly needs a full app
          build rather than Expo Go. Saying so is better than implying a protection you do not have.
        </Text>
      </View>

      <View style={styles.wipe}>
        <Button
          label={wiping ? 'Forgetting…' : 'Forget everything'}
          onPress={confirmWipe}
          disabled={wiping || summary.facts === 0}
          tone="danger"
        />
      </View>
    </Screen>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.figure}>
      <Text style={type.datum}>{value}</Text>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  figures: {
    flexDirection: 'row',
    marginLeft: space(5),
    marginRight: space(2.5),
    backgroundColor: c.surface,
    padding: space(2.5),
    gap: space(3),
  },
  figure: { flex: 1, gap: 2 },
  figureLabel: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: c.inkFaint },
  section: { marginLeft: space(5), marginRight: space(2.5), marginTop: space(3.5), gap: space(1) },
  p: { ...type.body, maxWidth: 330 },
  wipe: { marginLeft: space(5), marginRight: space(2.5), marginTop: space(5) },
});

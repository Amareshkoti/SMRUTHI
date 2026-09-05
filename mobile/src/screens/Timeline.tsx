import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { c, font, space, THREAD, type } from '../theme';
import { Screen, Button, Notice } from '../components/Chrome';
import { api } from '../api';
import { saveDocument, type StoredDocument } from '../db';

export function TimelineScreen({
  documents,
  onChanged,
}: {
  documents: StoredDocument[];
  onChanged: () => void;
}) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { documents: docs, factCount } = await api.ingest(link.trim());
      for (const d of docs) await saveDocument(d);
      setLink('');
      setNote(
        `Read ${docs.length} ${docs.length === 1 ? 'report' : 'reports'} and remembered ${factCount} facts. ` +
          `The file itself stayed in your Drive.`,
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Your memory"
      subtitle="Every report you add is read once, understood, and remembered. The paper stays yours."
    >
      <View style={styles.adder}>
        <Text style={type.bodyStrong}>Add a report from Google Drive</Text>
        <TextInput
          value={link}
          onChangeText={setLink}
          placeholder="Paste the share link"
          placeholderTextColor={c.inkFaint}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <Text style={type.small}>Set the file to “Anyone with the link” before pasting.</Text>
        <View style={styles.actions}>
          <Button
            label={busy ? 'Reading…' : 'Add report'}
            onPress={add}
            disabled={busy || link.trim().length === 0}
          />
          {busy ? <ActivityIndicator color={c.ink} /> : null}
        </View>
      </View>

      {error ? <View style={styles.slot}><Notice text={error} tone="error" /></View> : null}
      {note ? <View style={styles.slot}><Notice text={note} /></View> : null}

      {documents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={type.lead}>Nothing remembered yet.</Text>
          <Text style={[type.body, styles.emptyBody]}>
            Add your oldest report first. The value shows up when there are several years to compare.
          </Text>
        </View>
      ) : (
        documents.map((d) => (
          <View key={d.id} style={styles.row}>
            <View style={styles.node} />
            <View style={styles.rowBody}>
              <Text style={styles.year}>{d.doc_date.slice(0, 4) || '—'}</Text>
              <Text style={type.bodyStrong}>{d.hospital || d.title}</Text>
              <Text style={type.small}>
                {d.doc_date} — {d.fact_count} {d.fact_count === 1 ? 'result' : 'results'} remembered
              </Text>
              {d.doctor ? <Text style={type.small}>{d.doctor}</Text> : null}
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  adder: {
    backgroundColor: c.surface,
    marginLeft: space(5),
    marginRight: space(2.5),
    padding: space(2.5),
    gap: space(1.25),
  },
  input: {
    borderBottomWidth: 1.5,
    borderBottomColor: c.ink,
    paddingVertical: space(1.25),
    fontFamily: font.body,
    fontSize: 16,
    color: c.ink,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(1) },
  slot: { marginLeft: space(5), marginRight: space(2.5), marginTop: space(2) },
  empty: { marginLeft: space(5), marginRight: space(2.5), marginTop: space(4), gap: space(1) },
  emptyBody: { maxWidth: 300 },
  row: { flexDirection: 'row', marginTop: space(3.5), paddingRight: space(2.5) },
  node: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: c.paper,
    borderWidth: 2,
    borderColor: c.ink,
    marginLeft: THREAD.x - 4.75,
    marginTop: 6,
  },
  rowBody: { marginLeft: space(2.5), flex: 1, gap: 2 },
  year: { fontFamily: font.display, fontSize: 21, color: c.inkFaint },
});

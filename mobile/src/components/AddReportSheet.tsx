import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { c, font, space } from '../theme';
import { Sheet, Button, Notice } from './Chrome';
import { api } from '../api';
import { saveDocument } from '../db';

const STAGES = ['Downloading from Drive', 'Reading the page', 'Structuring the facts', 'Discarding the file'];

export function AddReportSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (note: string) => void;
}) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [stageIdx, setStageIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  function reset() {
    setLink('');
    setBusy(false);
    setStageIdx(-1);
    setError(null);
    if (timer.current) clearInterval(timer.current);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function add() {
    if (busy || !link.trim()) return;
    setBusy(true);
    setError(null);
    setStageIdx(0);
    timer.current = setInterval(() => {
      setStageIdx((i) => (i < STAGES.length - 2 ? i + 1 : i));
    }, 700);

    try {
      const { documents: docs, factCount } = await api.ingest(link.trim());
      for (const d of docs) await saveDocument(d);
      if (timer.current) clearInterval(timer.current);
      setStageIdx(STAGES.length - 1);
      reset();
      onSaved(
        `Read ${docs.length} ${docs.length === 1 ? 'report' : 'reports'} and remembered ${factCount} facts. ` +
          `The file itself stayed in your Drive.`,
      );
      onClose();
    } catch (err) {
      if (timer.current) clearInterval(timer.current);
      setBusy(false);
      setStageIdx(-1);
      setError(err instanceof Error ? err.message : 'Could not add that file.');
    }
  }

  return (
    <Sheet open={open} onClose={close}>
      <Text style={styles.title}>Add a report</Text>
      <Text style={styles.subtitle}>
        Paste a Google Drive link set to "Anyone with the link". The file is read once, then dropped.
      </Text>

      <TextInput
        value={link}
        onChangeText={setLink}
        placeholder="drive.google.com/file/d/…"
        placeholderTextColor={c.textFaint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />

      {error ? (
        <View style={styles.errorSlot}>
          <Notice text={error} tone="error" />
        </View>
      ) : null}

      {busy ? (
        <View style={styles.stages}>
          {STAGES.map((label, i) => (
            <View key={label} style={styles.stageRow}>
              <View style={[styles.dot, stageIdx > i && styles.dotDone, stageIdx === i && styles.dotActive]} />
              <Text style={[styles.stageLabel, stageIdx >= i && styles.stageLabelOn]}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label="Cancel" onPress={close} disabled={busy} tone="quiet" />
        <View style={styles.spacer}>
          <Button label={busy ? 'Reading…' : 'Read it'} onPress={add} disabled={busy || !link.trim()} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 27, lineHeight: 34, color: c.text },
  subtitle: { fontFamily: font.body, fontSize: 13, lineHeight: 21, color: c.textMuted, marginTop: space(1) },
  input: {
    marginTop: space(2.5), backgroundColor: 'rgba(255,255,255,.05)', borderWidth: 1, borderColor: c.hairSoft,
    borderRadius: 12, paddingVertical: space(1.75), paddingHorizontal: space(2), color: c.text, fontSize: 15, fontFamily: font.body,
  },
  errorSlot: { marginTop: space(2) },
  stages: { marginTop: space(2.5), gap: space(1.25) },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.12)' },
  dotDone: { backgroundColor: c.mint },
  dotActive: { backgroundColor: c.gold },
  stageLabel: { fontFamily: font.body, fontSize: 13, color: c.textFaint },
  stageLabelOn: { color: c.textSoft },
  actions: { flexDirection: 'row', gap: space(1.25), marginTop: space(3) },
  spacer: { flex: 1 },
});

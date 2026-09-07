import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { c, font, space } from '../theme';
import { Sheet, Button, Notice } from './Chrome';
import { api } from '../api';
import { pushDocument } from '../remote';
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from '../../../shared/contracts';

const STAGES = ['Uploading the file', 'Reading the page', 'Structuring the facts', 'Discarding the file'];

/** What the server will accept. Anything else is rejected before it is uploaded. */
const ACCEPTED = [...ACCEPTED_MIME_TYPES];

/**
 * A phone photo is a few MB and base64 adds a third. Refuse oversized files
 * here, with a sentence a person can act on, rather than letting the request
 * die against the server's body limit.
 */
const MAX_BYTES = MAX_UPLOAD_BYTES;

interface Picked {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

async function readFileBase64(uri: string): Promise<string> {
  if (Platform.OS !== 'web') {
    return new File(uri).base64();
  }

  // expo-file-system's File class is native-only. On web, document-picker
  // returns a blob URL, so read it through the browser instead.
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not open the selected file.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function AddReportSheet({
  open,
  onClose,
  onSaved,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (note: string) => void;
  userId: string | null;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [stageIdx, setStageIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  function reset() {
    setPicked(null);
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

  async function pick() {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset) return;

      const mimeType = asset.mimeType ?? '';
      if (!ACCEPTED.includes(mimeType)) {
        setError('Please choose a PDF or a photo of the report.');
        return;
      }
      if (asset.size && asset.size > MAX_BYTES) {
        setError(`That file is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB. A photo of the page is usually enough.`);
        return;
      }
      setPicked({ uri: asset.uri, name: asset.name || 'report', mimeType, size: asset.size ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the file picker.');
    }
  }

  async function read() {
    if (busy || !picked) return;
    setBusy(true);
    setError(null);
    setStageIdx(0);
    timer.current = setInterval(() => {
      setStageIdx((i) => (i < STAGES.length - 2 ? i + 1 : i));
    }, 700);

    try {
      const fileBase64 = await readFileBase64(picked.uri);
      const { documents: docs, factCount } = await api.ingest({
        fileBase64,
        mimeType: picked.mimeType,
        name: picked.name,
      });
      for (const d of docs) await pushDocument(userId, d);

      if (timer.current) clearInterval(timer.current);
      setStageIdx(STAGES.length - 1);
      reset();
      onSaved(
        `Read ${docs.length} ${docs.length === 1 ? 'report' : 'reports'} and remembered ${factCount} facts. ` +
          `The file itself was never stored.`,
      );
      onClose();
    } catch (err) {
      if (timer.current) clearInterval(timer.current);
      setBusy(false);
      setStageIdx(-1);
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  }

  return (
    <Sheet open={open} onClose={close}>
      <Text style={styles.title}>Add a report</Text>
      <Text style={styles.subtitle}>
        Choose a PDF or a photo from this phone. It is read once to pull out the numbers, then
        dropped — no copy is kept anywhere.
      </Text>

      <Pressable onPress={pick} disabled={busy} style={styles.dropzone} accessibilityRole="button">
        {picked ? (
          <>
            <Text style={styles.pickedName} numberOfLines={1}>{picked.name}</Text>
            <Text style={styles.pickedMeta}>
              {picked.mimeType.replace('application/', '').replace('image/', '').toUpperCase()}
              {picked.size ? ` · ${(picked.size / 1024 / 1024).toFixed(1)} MB` : ''} · tap to change
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.dropzoneIcon}>+</Text>
            <Text style={styles.dropzoneLabel}>Choose a file</Text>
            <Text style={styles.pickedMeta}>PDF or photo</Text>
          </>
        )}
      </Pressable>

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
          <Button label={busy ? 'Reading…' : 'Read it'} onPress={read} disabled={busy || !picked} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 27, lineHeight: 34, color: c.text },
  subtitle: { fontFamily: font.body, fontSize: 13, lineHeight: 21, color: c.textMuted, marginTop: space(1) },

  dropzone: {
    marginTop: space(2.5), borderRadius: 16, borderWidth: 1, borderColor: c.hairSoft,
    borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,.03)',
    paddingVertical: space(3), paddingHorizontal: space(2), alignItems: 'center', gap: 4,
  },
  dropzoneIcon: { fontFamily: font.bodyMedium, fontSize: 22, color: c.gold, lineHeight: 26 },
  dropzoneLabel: { fontFamily: font.bodyMedium, fontSize: 15, color: c.text },
  pickedName: { fontFamily: font.bodyMedium, fontSize: 15, color: c.text, maxWidth: '100%' },
  pickedMeta: { fontFamily: font.body, fontSize: 12, color: c.textFaint },

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

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { c, font, space } from '../theme';
import { Sheet, Button, Notice } from './Chrome';
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from '../../../shared/contracts';
import { startUpload } from '../uploadJob';
import type { FamilyProfile } from '../family';

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

export function AddReportSheet({
  open,
  onClose,
  onSaved,
  userId,
  sharedFile,
  family,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (note: string) => void;
  userId: string | null;
  sharedFile?: Picked | null;
  family: FamilyProfile[];
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [stageIdx, setStageIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  useEffect(() => {
    if (!sharedFile) return;
    setPicked(sharedFile);
    setError(null);
  }, [sharedFile]);

  function reset() {
    setPicked(null);
    setBusy(false);
    setStageIdx(-1);
    setError(null);
    if (timer.current) clearInterval(timer.current);
  }

  function close() {
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
    if (!userId) { setError('Please sign in again before adding a report.'); return; }
    setBusy(true);
    setError(null);
    void startUpload(userId, picked, personId).finally(() => {
      reset();
      onClose();
    });
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

      {family.length ? <View style={styles.family}><Text style={styles.familyLabel}>THIS REPORT BELONGS TO</Text><View style={styles.familyChoices}><Pressable onPress={() => setPersonId(null)} style={[styles.person, !personId && styles.personOn]}><Text style={[styles.personText, !personId && styles.personTextOn]}>Me</Text></Pressable>{family.map(member => <Pressable key={member.id} onPress={() => setPersonId(member.id)} style={[styles.person, personId === member.id && styles.personOn]}><Text style={[styles.personText, personId === member.id && styles.personTextOn]}>{member.displayName}</Text></Pressable>)}</View></View> : null}

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
        <Button label="Minimize" onPress={close} tone="quiet" />
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

  family: { marginTop: space(2) }, familyLabel: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.4, color: c.textFaint, marginBottom: space(1) }, familyChoices: { flexDirection: 'row', gap: space(1), flexWrap: 'wrap' }, person: { borderRadius: 12, borderWidth: 1, borderColor: c.hairSoft, paddingHorizontal: space(1.5), paddingVertical: space(0.9) }, personOn: { borderColor: c.gold, backgroundColor: c.goldWash }, personText: { fontFamily: font.bodyMedium, fontSize: 12, color: c.textMuted }, personTextOn: { color: c.gold },

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

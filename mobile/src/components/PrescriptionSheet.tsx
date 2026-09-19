import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { c, font, space } from '../theme';
import { Sheet, Button, Notice } from './Chrome';
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from '../../../shared/contracts';
import { describePrescription, type EphemeralChatContext } from '../ephemeralChat';
import { usePrescriptionJob, startPrescriptionRead, clearPrescriptionJob } from '../prescriptionJob';

const ACCEPTED = [...ACCEPTED_MIME_TYPES];

interface Picked {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * Reads a photographed or scanned prescription and lists its medicines.
 * Nothing here is ever saved -- not the photo, not the extracted medicines,
 * not the chat about them.
 *
 * Reading runs in prescriptionJob.ts, not in this component: tapping
 * "Minimize" closes the sheet but leaves the read running, so it doesn't
 * block using the rest of the app while a slow vision call finishes.
 */
export function PrescriptionSheet({
  open,
  onClose,
  onOpenAsk,
}: {
  open: boolean;
  onClose: () => void;
  onOpenAsk?: (ephemeral: EphemeralChatContext) => void;
}) {
  const job = usePrescriptionJob();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const phase: 'intro' | 'reading' | 'result' | 'error' =
    job?.busy ? 'reading' : job?.error ? 'error' : job?.result ? 'result' : 'intro';

  async function pick() {
    setPickError(null);
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
        setPickError('Please choose a PDF or a photo of the prescription.');
        return;
      }
      if (asset.size && asset.size > MAX_UPLOAD_BYTES) {
        setPickError(`That file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. A photo of the page is usually enough.`);
        return;
      }
      setPicked({ uri: asset.uri, name: asset.name || 'prescription', mimeType, size: asset.size ?? 0 });
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not open the file picker.');
    }
  }

  function read() {
    if (!picked) return;
    setPickError(null);
    void startPrescriptionRead(picked);
  }

  /** Closing while reading does NOT cancel it -- the job keeps running in the background. */
  function minimize() {
    onClose();
  }

  function readAnother() {
    clearPrescriptionJob();
    setPicked(null);
    setPickError(null);
  }

  function chatAboutResults() {
    if (!job?.result || !onOpenAsk) return;
    onClose();
    onOpenAsk({ label: 'Prescription', facts: [], extraContext: describePrescription(job.result), mode: 'prescription' });
    clearPrescriptionJob();
    setPicked(null);
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Read a prescription</Text>
        <Text style={styles.subtitle}>
          Choose a PDF or a photo of a doctor's prescription. It is read once to find the medicines, then
          dropped -- no copy is kept anywhere, and nothing about it is saved.
        </Text>

        {phase === 'intro' && (
          <>
            <Pressable onPress={pick} style={styles.dropzone} accessibilityRole="button">
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

            {pickError ? (
              <View style={styles.errorSlot}>
                <Notice text={pickError} tone="error" />
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button label="Minimize" onPress={onClose} tone="quiet" />
              <View style={styles.spacer}>
                <Button label="Read it" onPress={read} disabled={!picked} />
              </View>
            </View>
          </>
        )}

        {phase === 'reading' && (
          <>
            <View style={styles.stages}>
              <View style={styles.stageRow}>
                <View style={[styles.dot, styles.dotActive]} />
                <Text style={styles.stageLabel}>{job?.text || 'Reading the prescription'}</Text>
              </View>
            </View>
            <Text style={styles.minimizeHint}>
              This can take a moment. Minimize and it keeps reading in the background -- come back
              to this screen any time to see the medicines.
            </Text>
            <View style={styles.actions}>
              <Button label="Minimize" onPress={minimize} tone="quiet" />
            </View>
          </>
        )}

        {phase === 'result' && job?.result && (
          <>
            <View style={styles.memoryBox}>
              <View style={styles.memoryHead}>
                <View style={styles.memoryDot} />
                <Text style={styles.memoryTitle}>NOT SAVED · THIS SCREEN ONLY</Text>
              </View>
              <Text style={styles.memoryDesc}>
                These medicines are never written to your health memory or your account. Ask about
                them now in a private, one-off chat -- once you leave, they're gone for good.
              </Text>
              {onOpenAsk ? (
                <View style={{ marginTop: space(1.25) }}>
                  <Button label="💬 Chat About These Medicines (not saved)" onPress={chatAboutResults} tone="gold" />
                </View>
              ) : null}
            </View>

            {(job.result.doctor || job.result.hospital || job.result.documentDate) ? (
              <Text style={styles.meta}>
                {[job.result.doctor, job.result.hospital, job.result.documentDate].filter(Boolean).join(' · ')}
              </Text>
            ) : null}

            <View style={styles.medsSection}>
              <Text style={styles.medsSectionTitle}>{job.result.medicines.length} medicine{job.result.medicines.length === 1 ? '' : 's'} found</Text>
              <View style={styles.medsGrid}>
                {job.result.medicines.map((med, idx) => (
                  <View key={`${med.name}-${idx}`} style={styles.medCard}>
                    <Text style={styles.medName}>{med.name}</Text>
                    {(med.strength || med.frequency || med.duration) ? (
                      <Text style={styles.medMeta}>
                        {[med.strength, med.frequency, med.duration].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                    {med.instructions ? <Text style={styles.medInstructions}>{med.instructions}</Text> : null}
                    {med.commonUse ? <Text style={styles.medUse}>{med.commonUse}</Text> : null}
                  </View>
                ))}
              </View>
              <Text style={styles.disclaimerText}>
                ⚠️ What each medicine is "commonly used for" comes from general knowledge, not this prescription.
                It is not medical advice. Always follow your doctor's instructions.
              </Text>
            </View>

            <View style={styles.actions}>
              <Button label="Read another" onPress={readAnother} tone="quiet" />
              <View style={styles.spacer} />
              <Button label="Done" onPress={onClose} />
            </View>
          </>
        )}

        {phase === 'error' && (
          <>
            <View style={styles.errorSlot}>
              <Notice text={job?.error ?? 'Could not read that prescription.'} tone="error" />
            </View>
            <View style={styles.actions}>
              <Button label="Close" onPress={onClose} tone="quiet" />
              <View style={styles.spacer} />
              <Button label="Try again" onPress={readAnother} />
            </View>
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheetScroll: { maxHeight: Dimensions.get('window').height * 0.85 },
  sheetContent: { paddingBottom: space(3) },
  title: { fontFamily: font.display, fontSize: 25, lineHeight: 32, color: c.text },
  subtitle: { fontFamily: font.body, fontSize: 13, lineHeight: 20, color: c.textMuted, marginTop: space(1) },

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
  actions: { flexDirection: 'row', gap: space(1.25), marginTop: space(2.5) },
  spacer: { flex: 1 },

  stages: { marginTop: space(2.5), gap: space(1.25) },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.12)' },
  dotActive: { backgroundColor: c.gold },
  stageLabel: { fontFamily: font.body, fontSize: 13, color: c.textSoft },
  minimizeHint: { fontFamily: font.body, fontSize: 12, lineHeight: 18, color: c.textFaint, marginTop: space(1.5) },

  memoryBox: {
    backgroundColor: 'rgba(127,195,165,.08)', borderWidth: 1, borderColor: 'rgba(127,195,165,.25)',
    borderRadius: 14, padding: space(2), marginTop: space(2.5),
  },
  memoryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memoryDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.mint },
  memoryTitle: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.8, color: c.mint },
  memoryDesc: { fontFamily: font.body, fontSize: 12, lineHeight: 18, color: c.textSoft, marginTop: 4 },

  meta: { fontFamily: font.body, fontSize: 12, color: c.textFaint, marginTop: space(1.5) },

  medsSection: { marginTop: space(2.5) },
  medsSectionTitle: { fontFamily: font.bodySemibold, fontSize: 15, color: c.text, marginBottom: space(1.25) },
  medsGrid: { gap: space(1.25) },
  medCard: { backgroundColor: 'rgba(255,255,255,.03)', borderWidth: 1, borderColor: c.hairSoft, borderRadius: 14, padding: space(1.75) },
  medName: { fontFamily: font.bodyMedium, fontSize: 15, color: c.text },
  medMeta: { fontFamily: font.body, fontSize: 12, color: c.gold, marginTop: 3 },
  medInstructions: { fontFamily: font.body, fontSize: 12.5, color: c.textSoft, marginTop: 4 },
  medUse: { fontFamily: font.body, fontSize: 12.5, lineHeight: 18, color: c.textMuted, marginTop: 4 },

  disclaimerText: { fontFamily: font.body, fontSize: 10.5, lineHeight: 16, color: c.textFaint, marginTop: space(1.75), textAlign: 'center' },
});

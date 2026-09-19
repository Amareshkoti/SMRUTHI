import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, Platform, TextInput, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { c, font, space } from '../theme';
import { Sheet, Button, Notice } from './Chrome';
import { api, type Language, type FaceDiagnosisResult } from '../api';
import { downloadFaceDiagnosisReport } from '../reportPdf';
import { describeFaceDiagnosis, type EphemeralChatContext } from '../ephemeralChat';

type Phase = 'intro' | 'camera' | 'analyzing' | 'result' | 'error';

/**
 * Fixed capture resolution, applied from the very first render.
 *
 * Negotiating this at runtime (getAvailablePictureSizesAsync -> setPictureSize)
 * makes expo-camera tear down and rebind the whole capture session, and a tap
 * landing in that window fails. Binding once with a known-modest size avoids
 * the rebind altogether, and keeps the frame small enough that the native
 * rotate/mirror pass cannot run the app out of memory.
 *
 * Android CameraX resolves this through FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER,
 * so an unsupported value degrades to the nearest supported one rather than
 * failing. iOS takes a preset enum instead of WxH, so it keeps its default.
 */
const CAPTURE_SIZE = Platform.OS === 'android' ? '1280x720' : undefined;

export function FaceDiagnosisSheet({
  open,
  onClose,
  onOpenAsk,
  language = 'en',
}: {
  open: boolean;
  onClose: () => void;
  onOpenAsk?: (ephemeral: EphemeralChatContext) => void;
  language?: Language;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('intro');
  const [result, setResult] = useState<FaceDiagnosisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [downloading, setDownloading] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const readyRef = useRef(false);
  const capturingRef = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!open) stopAndReset();
  }, [open]);

  useEffect(() => stopAndReset, []);

  useEffect(() => {
    AsyncStorage.getItem('smruti_patient_name')
      .then((val) => {
        if (val) setUserName(val);
      })
      .catch(() => {});
  }, []);

  function handleNameChange(val: string) {
    setUserName(val);
    AsyncStorage.setItem('smruti_patient_name', val).catch(() => {});
  }

  async function handleDownload() {
    if (!result) return;
    try {
      setDownloading(true);
      await downloadFaceDiagnosisReport(result, userName);
    } catch (err) {
      console.error('[FaceDiagnosisSheet] Failed to generate report PDF:', err);
      Alert.alert('Report Error', 'Could not generate or share the face diagnosis report. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  function chatAboutResults() {
    if (!result || !onOpenAsk) return;
    onClose();
    onOpenAsk({ label: 'TCM Face Observation', facts: [], extraContext: describeFaceDiagnosis(result) });
  }

  function stopAndReset() {
    readyRef.current = false;
    capturingRef.current = false;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    setPhase('intro');
    setResult(null);
    setErrorMsg(null);
    setCameraReady(false);
    setCapturing(false);
    setDownloading(false);
  }

  function onCameraReady() {
    if (readyRef.current) return;
    readyRef.current = true;
    // The session is bound at its final size already, so this is only a short
    // grace period for the first frames to flow rather than a resize wait.
    settleTimer.current = setTimeout(() => {
      if (!readyRef.current) return; // closed/reset while we were waiting
      setCameraReady(true);
    }, 250);
  }

  async function start() {
    setErrorMsg(null);
    // Re-arm onCameraReady: leaving the camera phase unmounts the view, so the
    // next mount has to run the size negotiation again.
    readyRef.current = false;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    capturingRef.current = false;
    setCameraReady(false);
    setCapturing(false);
    let granted = permission?.granted;
    if (!granted) {
      const res = await requestPermission();
      granted = res.granted;
    }
    if (!granted) {
      setPhase('error');
      setErrorMsg('Camera access was not granted. Enable it in your phone settings, then try again.');
      return;
    }
    setPhase('camera');
  }

  /**
   * One shot at the native camera. It can reject outright, and on a session
   * that is still rebinding it can also never settle at all, so the wait is
   * bounded rather than left to hang the "Analyzing..." spinner forever.
   */
  async function takeShot(): Promise<string | null> {
    const cam = cameraRef.current;
    if (!cam) return null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error('camera capture timed out');
        error.name = 'CameraCaptureTimeoutError';
        reject(error);
      }, 10000);
    });
    try {
      const pic = await Promise.race([
        cam.takePictureAsync({
          base64: true,
          quality: 0.6,
          shutterSound: false,
          // Native halves the bitmap and retries on OutOfMemoryError, but only
          // while inSampleSize <= maxDownsampling -- which defaults to 1, so the
          // retry loop never actually runs. This gives it real headroom.
          maxDownsampling: 8,
        }),
        timeout,
      ]);
      return pic?.base64 ?? null;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async function capture() {
    if (!cameraRef.current || !cameraReady || capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    try {
      let base64: string | null = null;
      for (let attempt = 0; attempt < 2 && !base64; attempt++) {
        try {
          base64 = await takeShot();
        } catch (err) {
          // The first shot after the session rebinds can fail transiently;
          // give the camera a moment and try once more before giving up.
          // A timed-out call may still be running natively, so never overlap it
          // with a second capture request.
          if ((err as Error)?.name === 'CameraCaptureTimeoutError' || attempt === 1) throw err;
        }
        if (!base64) await new Promise((r) => setTimeout(r, 400));
      }

      if (!base64) throw new Error('camera returned no image');

      // Keep CameraView mounted until takePictureAsync has returned. Unmounting
      // it earlier stops the native session and can make the capture resolve
      // without image data on Android.
      setPhase('analyzing');
      const response = await api.faceDiagnosis(base64, language);
      if (!response) {
        setErrorMsg('Could not analyze face. Please ensure your face is well-lit and centered.');
        setPhase('error');
        return;
      }
      setResult(response);
      setPhase('result');
    } catch (err: any) {
      console.error('[FaceDiagnosis] capture failed:', err);
      // Keep the underlying code/message visible. The native layer distinguishes
      // ERR_CAMERA_OUT_OF_MEMORY from a plain capture failure, and swallowing
      // that detail turns every camera problem into the same dead end.
      const detail = [err?.code, err?.message].filter(Boolean).join(': ');
      setErrorMsg(
        'The camera could not take that photo. Hold the phone steady and try again.' +
          (detail ? `\n\nDetails: ${detail}` : '')
      );
      setPhase('error');
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>TCM Face Observation</Text>
        <Text style={styles.subtitle}>
          Traditional Chinese Medicine (TCM) face analysis. Not a medical device.
        </Text>

        {phase === 'intro' && (
          <>
            <View style={styles.instructionCard}>
              <Text style={styles.instructionText}>
                1. Make sure you are in a well-lit area.
              </Text>
              <Text style={styles.instructionText}>
                2. Position your face clearly in the frame.
              </Text>
              <Text style={styles.instructionText}>
                3. Remove glasses if possible for better analysis.
              </Text>
            </View>
            <View style={styles.actions}>
              <Button label="Start Camera" onPress={start} />
            </View>
          </>
        )}

        {phase === 'camera' && (
          <>
            <View style={styles.previewWrap}>
              <CameraView
                ref={cameraRef}
                style={styles.preview}
                facing="front"
                animateShutter={false}
                pictureSize={CAPTURE_SIZE}
                onCameraReady={onCameraReady}
              />
            </View>
            <View style={styles.actions}>
              <Button
                label={capturing ? 'Taking photo...' : cameraReady ? 'Capture & Analyze' : 'Starting camera...'}
                onPress={capture}
                disabled={!cameraReady || capturing}
              />
            </View>
          </>
        )}

        {phase === 'analyzing' && (
          <View style={styles.analyzingWrap}>
            <ActivityIndicator color={c.gold} size="large" />
            <Text style={styles.analyzingText}>Analyzing facial zones and skin tone...</Text>
          </View>
        )}

        {phase === 'result' && result && (
          <>
            {/* Overall Complexion Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHead}>
                <View style={[styles.swatch, { backgroundColor: `rgb(${result.overall.r},${result.overall.g},${result.overall.b})` }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryLabel}>OVERALL COMPLEXION</Text>
                  <Text style={styles.summaryValue}>{result.overall.description}</Text>
                </View>
              </View>
              <Text style={styles.summaryMeta}>
                RGB {result.overall.r}/{result.overall.g}/{result.overall.b} · Lightness {result.overall.lightnessPercent}%
              </Text>
              <Text style={styles.summaryMeta}>Image suitability: {result.overall.suitability}</Text>
            </View>

            {/* Traditional Pattern Flags */}
            <View style={styles.flagsCard}>
              <Text style={styles.flagsHeader}>TRADITIONAL PATTERN FLAGS</Text>
              {result.patternFlags.length ? (
                result.patternFlags.map((flag, idx) => (
                  <Text key={idx} style={styles.flagItem}>• {flag}</Text>
                ))
              ) : (
                <Text style={styles.flagItem}>No configured TCM color threshold was strongly triggered.</Text>
              )}
            </View>

            {/* Not saved -- chat about it now, or it's gone */}
            <View style={styles.memoryBox}>
              <View style={styles.memoryHead}>
                <View style={styles.memoryDot} />
                <Text style={styles.memoryTitle}>NOT SAVED · THIS SCREEN ONLY</Text>
              </View>
              <Text style={styles.memoryDesc}>
                This reading is never written to your health memory or your account. Ask about it now
                in a private, one-off chat -- once you leave, it's gone for good.
              </Text>
              {onOpenAsk ? (
                <View style={{ marginTop: space(1.25) }}>
                  <Button label="💬 Chat About Results (not saved)" onPress={chatAboutResults} tone="gold" />
                </View>
              ) : null}
            </View>

            {/* Patient Name Input for PDF Report */}
            <View style={styles.nameCard}>
              <Text style={styles.nameLabel}>PATIENT NAME (FOR DOWNLOADABLE REPORT)</Text>
              <TextInput
                style={styles.nameInput}
                value={userName}
                onChangeText={handleNameChange}
                placeholder="Enter patient name (e.g. Rahul Sharma)"
                placeholderTextColor={c.textFaint}
              />
            </View>

            {/* Traditional Zone Review */}
            <View style={styles.zoneSection}>
              <View style={styles.zoneHeaderRow}>
                <Text style={styles.zoneSectionTitle}>Traditional Zone Review</Text>
                <Text style={styles.zoneCount}>{result.zones.length} Zones</Text>
              </View>
              <View style={styles.zonesGrid}>
                {result.zones.map((zone) => (
                  <View key={zone.key} style={styles.zoneCard}>
                    <View style={styles.zoneCardHeader}>
                      <View style={[styles.zoneSwatch, { backgroundColor: `rgb(${zone.r},${zone.g},${zone.b})` }]} />
                      <Text style={styles.zoneName}>{zone.label}</Text>
                    </View>
                    <Text style={styles.zoneAssociation}>{zone.association}</Text>
                    <Text style={styles.zoneObservation}>{zone.observation}</Text>
                    <Text style={styles.zoneMeta}>RGB {zone.r}/{zone.g}/{zone.b} · Lightness {zone.lightnessPercent}%</Text>
                  </View>
                ))}
              </View>

              {/* Download Report Button */}
              <View style={styles.downloadWrapper}>
                <Button
                  label={downloading ? 'Preparing Report...' : '📄 Download Face Diagnosis Report (PDF)'}
                  onPress={handleDownload}
                  disabled={downloading}
                />
              </View>

              <Text style={styles.disclaimerText}>
                Disclaimer: This educational report describes camera color measurements using traditional face-mapping terminology. It is not medical advice and cannot diagnose any condition.
              </Text>
            </View>

            <View style={styles.actions}>
              <Button label="Analyze again" onPress={start} tone="quiet" />
              <View style={styles.spacer} />
              <Button label="Done" onPress={onClose} />
            </View>
          </>
        )}

        {phase === 'error' && (
          <>
            <View style={styles.errorSlot}>
              <Notice text={errorMsg ?? 'An error occurred.'} tone="error" />
            </View>
            <View style={styles.actions}>
              <Button label="Close" onPress={onClose} tone="quiet" />
              <View style={styles.spacer} />
              <Button label="Try again" onPress={start} />
            </View>
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheetScroll: {
    maxHeight: Dimensions.get('window').height * 0.85,
  },
  sheetContent: {
    paddingBottom: space(3),
  },
  title: { fontFamily: font.display, fontSize: 25, lineHeight: 32, color: c.text },
  subtitle: { fontFamily: font.body, fontSize: 13, lineHeight: 20, color: c.textMuted, marginTop: space(1) },

  instructionCard: {
    marginTop: space(2.5), borderRadius: 16, borderWidth: 1, borderColor: c.hairSoft,
    backgroundColor: 'rgba(255,255,255,.03)', padding: space(2.25), gap: space(1),
  },
  instructionText: { fontFamily: font.body, fontSize: 14, lineHeight: 22, color: c.textSoft },

  previewWrap: { alignItems: 'center', marginTop: space(2.5) },
  preview: { width: 240, height: 320, borderRadius: 20, overflow: 'hidden' },

  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: space(3) },
  spacer: { width: space(2) },

  errorSlot: { marginTop: space(2.5) },

  analyzingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: space(5) },
  analyzingText: { fontFamily: font.bodyMedium, fontSize: 14, color: c.textMuted, marginTop: space(2) },

  summaryCard: {
    marginTop: space(2.5),
    backgroundColor: 'rgba(0,0,0,.35)',
    borderWidth: 1,
    borderColor: 'rgba(216,178,107,.28)',
    borderRadius: 14,
    padding: space(2),
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  swatch: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,.2)' },
  summaryLabel: {
    fontFamily: font.bodySemibold, fontSize: 10.5, letterSpacing: 1, color: c.gold,
  },
  summaryValue: {
    fontFamily: font.bodyMedium, fontSize: 15, color: c.text, marginTop: 2,
  },
  summaryMeta: {
    fontFamily: font.body, fontSize: 11.5, color: c.textFaint, marginTop: space(1),
  },

  flagsCard: {
    marginTop: space(1.5),
    backgroundColor: 'rgba(216,178,107,.06)',
    borderWidth: 1,
    borderColor: 'rgba(216,178,107,.25)',
    borderRadius: 14,
    padding: space(1.75),
  },
  flagsHeader: {
    fontFamily: font.bodySemibold, fontSize: 10.5, letterSpacing: 1, color: c.gold, marginBottom: space(0.75),
  },
  flagItem: {
    fontFamily: font.body, fontSize: 12.5, lineHeight: 19, color: c.textSoft,
  },

  memoryBox: {
    backgroundColor: 'rgba(127,195,165,.08)',
    borderWidth: 1,
    borderColor: 'rgba(127,195,165,.25)',
    borderRadius: 14,
    padding: space(2),
    marginTop: space(2.5),
  },
  memoryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memoryDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.mint },
  memoryTitle: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.8, color: c.mint },
  memoryDesc: { fontFamily: font.body, fontSize: 12, lineHeight: 18, color: c.textSoft, marginTop: 4 },

  nameCard: {
    backgroundColor: 'rgba(255,255,255,.03)',
    borderWidth: 1,
    borderColor: 'rgba(216,178,107,.25)',
    borderRadius: 14,
    padding: space(1.75),
    marginTop: space(2),
  },
  nameLabel: {
    fontFamily: font.bodySemibold,
    fontSize: 10.5,
    letterSpacing: 1,
    color: c.gold,
    marginBottom: space(1),
  },
  nameInput: {
    fontFamily: font.body,
    fontSize: 14,
    color: c.text,
    backgroundColor: 'rgba(0,0,0,.3)',
    borderWidth: 1,
    borderColor: c.hairSoft,
    borderRadius: 10,
    paddingHorizontal: space(1.75),
    paddingVertical: space(1.25),
  },

  zoneSection: { marginTop: space(2.5) },
  zoneHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space(1.25),
  },
  zoneSectionTitle: { fontFamily: font.bodySemibold, fontSize: 15, color: c.text },
  zoneCount: { fontFamily: font.body, fontSize: 12, color: c.gold },

  zonesGrid: { gap: space(1.25) },
  zoneCard: {
    backgroundColor: 'rgba(255,255,255,.03)',
    borderWidth: 1,
    borderColor: c.hairSoft,
    borderRadius: 14,
    padding: space(1.75),
  },
  zoneCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  zoneSwatch: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,.2)' },
  zoneName: { fontFamily: font.bodyMedium, fontSize: 13.5, color: c.text },
  zoneAssociation: { fontFamily: font.body, fontSize: 11, color: c.textFaint, marginTop: 2 },
  zoneObservation: { fontFamily: font.body, fontSize: 12.5, lineHeight: 18, color: c.textSoft, marginTop: 4 },
  zoneMeta: { fontFamily: font.body, fontSize: 10.5, color: c.textFaint, marginTop: 4 },

  downloadWrapper: { marginTop: space(2.5) },
  disclaimerText: {
    fontFamily: font.body, fontSize: 11, lineHeight: 16, color: c.textFaint,
    marginTop: space(1.75), textAlign: 'justify',
  },
});

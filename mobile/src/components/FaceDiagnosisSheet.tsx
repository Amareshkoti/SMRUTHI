import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { c, font, space } from '../theme';
import { Sheet, Button, Notice } from './Chrome';
import { api, type Language } from '../api';

type Phase = 'intro' | 'camera' | 'analyzing' | 'result' | 'error';

export function FaceDiagnosisSheet({
  open,
  onClose,
  language = 'en',
}: {
  open: boolean;
  onClose: () => void;
  language?: Language;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('intro');
  const [result, setResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const cameraRef = useRef<CameraView>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) stopAndReset();
  }, [open]);

  function stopAndReset() {
    setPhase('intro');
    setResult(null);
    setErrorMsg(null);
    setCameraReady(false);
    setPictureSize(undefined);
  }

  async function onCameraReady() {
    setCameraReady(true);
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      // Find a small but reasonable resolution (e.g. at least ~480p) to avoid crashing, but large enough for face analysis
      const suitable = (sizes ?? [])
        .map((s) => {
          const [w, h] = s.split('x').map(Number);
          return { s, area: (w || 9999) * (h || 9999) };
        })
        .sort((a, b) => a.area - b.area)
        .find(s => s.area > 300000) || (sizes && sizes.length ? { s: sizes[0] } : null);
        
      if (suitable) {
        setPictureSize(suitable.s);
      }
    } catch {
      // Fallback to default
    }
  }

  async function start() {
    setErrorMsg(null);
    setCameraReady(false);
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

  async function capture() {
    if (!cameraRef.current || !cameraReady) return;
    try {
      setPhase('analyzing');
      const pic = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.3, // Even lower quality for faster, safer decoding
      });
      if (pic?.base64) {
        const response = await api.faceDiagnosis(pic.base64, language);
        setResult(response);
        setPhase('result');
      } else {
        throw new Error('No image data');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not process that reading. Please try again.');
      setPhase('error');
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Chinese Face Diagnosis</Text>
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
                animateShutter={true}
                pictureSize={pictureSize}
                onCameraReady={onCameraReady}
              />
            </View>
            <View style={styles.actions}>
              <Button label={cameraReady ? "Capture & Analyze" : "Starting camera..."} onPress={capture} disabled={!cameraReady} />
            </View>
          </>
        )}

        {phase === 'analyzing' && (
          <View style={styles.analyzingWrap}>
            <ActivityIndicator color={c.gold} size="large" />
            <Text style={styles.analyzingText}>Analyzing facial zones and skin tone...</Text>
          </View>
        )}

        {phase === 'result' && (
          <>
            <View style={styles.resultBox}>
              <Text style={styles.resultText}>{result}</Text>
            </View>
            <Text style={styles.disclaimerText}>
              ⚠️ Disclaimer: This analysis is based on Traditional Chinese Medicine principles and should not be used as medical advice or to diagnose any condition.
            </Text>
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

  resultBox: {
    marginTop: space(2.5), borderRadius: 16, borderWidth: 1, borderColor: 'rgba(216,178,107,.28)',
    backgroundColor: 'rgba(216,178,107,.05)', padding: space(2.25),
  },
  resultText: { fontFamily: font.body, fontSize: 15, lineHeight: 24, color: c.text },

  disclaimerText: {
    fontFamily: font.body, fontSize: 11, lineHeight: 16, color: c.textFaint,
    marginTop: space(2), textAlign: 'justify',
  },
});

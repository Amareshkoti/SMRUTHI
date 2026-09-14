import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Dimensions, TextInput, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';
import { c, font, space } from '../theme';
import { Sheet, Button, Notice } from './Chrome';
import {
  frameBrightness,
  estimateBpm,
  classifyBpm,
  buildCheckupFacts,
  type PulseSample,
  type PulseAnalysisResult,
  type CheckupTestItem,
} from '../pulse';
import { saveCheckupDocument, type StoredDocument } from '../db';
import { downloadCheckupReport } from '../reportPdf';
import { loadBpCalibration, saveBpCalibration, calibrationAgeDays, type BpCalibration } from '../bpCalibration';

const DURATION_MS = 20_000;
const MIN_CAPTURE_GAP_MS = 60; // 60ms gap yields ~10-15 FPS which is ideal for PPG

const RANGE_COLOR: Record<'Low' | 'Normal' | 'Elevated', string> = {
  Low: c.gold,
  Normal: c.mint,
  Elevated: c.rose,
};

type Phase = 'intro' | 'measuring' | 'result' | 'error';

/**
 * Pulse via the rear camera + flash, not the fingerprint sensor.
 *
 * Captures pulsatile capillary volume changes, extracts comprehensive full-body
 * physiological test markers, plots a clinical heartbeat waveform with units,
 * stores results in SQLite device memory for chat in the Ask tab, and generates
 * a downloadable PDF health report.
 */
export function PulseSheet({
  open,
  onClose,
  userId,
  onSavedRecord,
  onOpenAsk,
}: {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
  onSavedRecord?: () => void;
  onOpenAsk?: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('intro');
  const [bpm, setBpm] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<PulseAnalysisResult | null>(null);
  const [userName, setUserName] = useState('');
  const [savedToMemory, setSavedToMemory] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [downloading, setDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [capturedCount, setCapturedCount] = useState(0);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);

  const [bpCalibration, setBpCalibration] = useState<BpCalibration | null>(null);
  const [showCalibrationForm, setShowCalibrationForm] = useState(false);
  const [calSystolic, setCalSystolic] = useState('');
  const [calDiastolic, setCalDiastolic] = useState('');
  const [calibrationSaving, setCalibrationSaving] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const runningRef = useRef(false);
  const readyRef = useRef(false);
  const startRef = useRef(0);
  const samplesRef = useRef<PulseSample[]>([]);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('smruti_patient_name')
      .then((val) => {
        if (val) setUserName(val);
      })
      .catch(() => {});
    loadBpCalibration().then(setBpCalibration).catch(() => {});
  }, []);

  function handleNameChange(val: string) {
    setUserName(val);
    AsyncStorage.setItem('smruti_patient_name', val).catch(() => {});
  }

  async function handleSaveCalibration() {
    if (!analysis?.upstrokeMs || !analysis?.bpm) return;
    const sys = parseInt(calSystolic, 10);
    const dia = parseInt(calDiastolic, 10);
    if (!Number.isFinite(sys) || !Number.isFinite(dia) || sys < 70 || sys > 220 || dia < 40 || dia > 140 || dia >= sys) {
      Alert.alert('Check the numbers', 'Enter a plausible systolic (70-220) and diastolic (40-140) reading from your BP cuff, taken around now.');
      return;
    }
    setCalibrationSaving(true);
    try {
      const cal: BpCalibration = { systolic: sys, diastolic: dia, upstrokeMs: analysis.upstrokeMs, bpm: analysis.bpm, at: new Date().toISOString() };
      await saveBpCalibration(cal);
      setBpCalibration(cal);
      setShowCalibrationForm(false);
      setCalSystolic('');
      setCalDiastolic('');

      // Recompute this session's checkup with the new calibration so BP shows up
      // immediately, without forcing the user through another 20-second scan.
      if (samplesRef.current.length) {
        const recomputed = estimateBpm(samplesRef.current, cal);
        if (recomputed.bpm) {
          setAnalysis(recomputed);
          setBpm(recomputed.bpm);
          if (userId) void persistToMemory(recomputed, userId);
        }
      }
    } finally {
      setCalibrationSaving(false);
    }
  }

  function stopAndReset() {
    runningRef.current = false;
    readyRef.current = false;
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = null;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    setPhase('intro');
    setBpm(null);
    setAnalysis(null);
    setSavedToMemory(false);
    setDownloading(false);
    setErrorMsg(null);
    setElapsedMs(0);
    setCapturedCount(0);
    setPictureSize(undefined);
    samplesRef.current = [];
  }

  async function persistToMemory(res: PulseAnalysisResult, uid?: string | null) {
    if (!uid) return;
    try {
      const docId = `chk-${Date.now()}`;
      const docDate = new Date().toISOString().slice(0, 10);
      const facts = buildCheckupFacts(res, docId, docDate);
      const doc: StoredDocument = {
        id: docId,
        title: 'Full Body Health Checkup (Camera PPG)',
        source_name: 'SMRUTI Optical Sensor',
        doc_date: docDate,
        hospital: 'SMRUTI Health Sensor',
        doctor: 'Automated Biomarker Screening',
        fact_count: facts.length,
        added_at: new Date().toISOString(),
      };
      await saveCheckupDocument(uid, doc, facts);
      setSavedToMemory(true);
      onSavedRecord?.();
    } catch (err) {
      console.warn('[PulseSheet] Error saving checkup to memory:', err);
    }
  }

  async function handleDownload() {
    if (!analysis) return;
    try {
      setDownloading(true);
      await downloadCheckupReport(analysis, userName);
    } catch (err) {
      console.error('[PulseSheet] Failed to generate report PDF:', err);
      Alert.alert('Report Error', 'Could not generate or share the health checkup report. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  // The Sheet keeps its children mounted while hidden (Modal just toggles
  // visibility) -- without this, closing mid-measurement would leave the
  // capture loop and camera session running in the background.
  useEffect(() => {
    if (!open) stopAndReset();
    return () => {
      runningRef.current = false;
      if (tickTimer.current) clearInterval(tickTimer.current);
    };
  }, [open]);

  async function start() {
    setErrorMsg(null);
    let granted = permission?.granted;
    if (!granted) {
      const res = await requestPermission();
      granted = res.granted;
    }
    if (!granted) {
      setPhase('error');
      setErrorMsg('Camera access was not granted. Enable it for SMRUTI in your phone settings, then try again.');
      return;
    }
    samplesRef.current = [];
    setBpm(null);
    setElapsedMs(0);
    setCapturedCount(0);
    setPhase('measuring');
  }

  async function onCameraReady() {
    if (readyRef.current) return; // a re-fire from the pictureSize change below -- ignore it
    readyRef.current = true;
    let sizeChanged = false;
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      const smallest = (sizes ?? [])
        .map((s) => {
          const [w, h] = s.split('x').map(Number);
          return { s, area: (w || 9999) * (h || 9999) };
        })
        .sort((a, b) => a.area - b.area)[0];
      if (smallest) {
        setPictureSize(smallest.s);
        sizeChanged = true;
      }
    } catch {
      // Fall back to the device default size; the frame will just decode a bit slower.
    }

    // Give the native camera session time to actually reconfigure for the
    // new picture size before the first capture -- starting immediately
    // raced that reconfiguration and could crash the camera pipeline.
    settleTimer.current = setTimeout(() => {
      if (!readyRef.current) return; // closed/reset while we were waiting
      startRef.current = Date.now();
      runningRef.current = true;
      tickTimer.current = setInterval(() => {
        setElapsedMs(Date.now() - startRef.current);
        setCapturedCount(samplesRef.current.length);
      }, 200);
      captureLoop();
    }, sizeChanged ? 500 : 50);
  }

  async function captureLoop() {
    if (!runningRef.current) return;
    try {
      const cam = cameraRef.current;
      const frameStart = Date.now();
      if (cam) {
        try {
          // skipProcessing returns raw sensor frame without orientation transforms
          const pic = await cam.takePictureAsync({
            base64: true,
            skipProcessing: true,
            shutterSound: false,
          });
          if (pic?.base64) {
            const brightness = frameBrightness(pic.base64);
            if (brightness !== null && brightness > 0) {
              samplesRef.current.push({ t: Date.now(), value: brightness });
            }
          }
        } catch {
          // An occasional dropped frame from the camera HAL is gracefully tolerated
        }
      }
      if (!runningRef.current) return;
      if (Date.now() - startRef.current >= DURATION_MS) {
        await finish();
        return;
      }
      const gap = Math.max(0, MIN_CAPTURE_GAP_MS - (Date.now() - frameStart));
      setTimeout(captureLoop, gap);
    } catch (err) {
      console.error('[Pulse] Critical capture loop error:', err);
      await finish();
    }
  }

  async function finish() {
    runningRef.current = false;
    readyRef.current = false;
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = null;

    // Small delay to allow any in-flight native frame to finish cleanly
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const result = estimateBpm(samplesRef.current, bpCalibration);
      if (result.bpm) {
        setBpm(result.bpm);
        setAnalysis(result);
        setPhase('result');
        if (userId) {
          void persistToMemory(result, userId);
        }
      } else {
        setErrorMsg(result.reason ?? 'Could not get a reading. Please try again.');
        setPhase('error');
      }
    } catch {
      setErrorMsg('Could not process that reading. Please try again.');
      setPhase('error');
    }
  }
  const seconds = Math.min(DURATION_MS, elapsedMs) / 1000;

  const points = analysis?.waveformPoints ?? [];
  const svgW = 340;
  const svgH = 120;
  const plotLeft = 44;
  const plotRight = 328;
  const plotTop = 16;
  const plotBottom = 84;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  let polylinePoints = '';
  if (points.length > 1) {
    polylinePoints = points
      .map((val, idx) => {
        const x = plotLeft + (idx / (points.length - 1)) * plotW;
        const y = plotBottom - val * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  const allTests = analysis?.testItems ?? [];
  const categories = ['All', ...Array.from(new Set(allTests.map((t) => t.category)))];
  const filteredTests = selectedCategory === 'All' ? allTests : allTests.filter((t) => t.category === selectedCategory);

  return (
    <Sheet open={open} onClose={onClose}>
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Full Body Vital Checkup</Text>
        <Text style={styles.subtitle}>
          Optical camera photoplethysmography (PPG) vitals and physiological screening. Not a medical device.
        </Text>

        {phase === 'intro' && (
          <>
            <View style={styles.instructionCard}>
              <Text style={styles.instructionText}>
                1. Rest the pad of your index finger gently over the rear camera lens and LED flashlight.
              </Text>
              <Text style={[styles.instructionText, { marginTop: 8, color: c.gold }]}>
                💡 Tip: Do NOT press hard. Pressing firmly cuts off capillary blood flow. Rest your finger lightly so blood can pulse naturally.
              </Text>
            </View>
            <View style={styles.actions}>
              <Button label="Start Checkup" onPress={start} />
            </View>
          </>
        )}

        {phase === 'measuring' && (
          <>
            <View style={styles.previewWrap}>
              <CameraView
                ref={cameraRef}
                style={styles.preview}
                facing="back"
                enableTorch={true}
                animateShutter={false}
                flash="off"
                pictureSize={pictureSize}
                onCameraReady={onCameraReady}
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(seconds)}s / {DURATION_MS / 1000}s · {capturedCount} frames
            </Text>
            <Text style={[styles.instructionText, { textAlign: 'center', marginTop: 4, fontSize: 12, color: c.textMuted }]}>
              {capturedCount > 8 ? 'Tracking pulsatile blood volume... hold steady' : 'Detecting fingertip tissue... hold still'}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(seconds / (DURATION_MS / 1000)) * 100}%` }]} />
            </View>
          </>
        )}

        {phase === 'result' && bpm && (
          <>
            <View style={styles.resultCard}>
              <Text style={styles.resultValue}>{bpm}</Text>
              <Text style={styles.resultUnit}>beats per minute (Heart Rate)</Text>
              <View style={[styles.rangePill, { borderColor: RANGE_COLOR[classifyBpm(bpm).label] }]}>
                <Text style={[styles.rangePillText, { color: RANGE_COLOR[classifyBpm(bpm).label] }]}>{classifyBpm(bpm).label}</Text>
              </View>
            </View>
            <Text style={styles.rangeNote}>{classifyBpm(bpm).note}</Text>

            {/* Live Optical Heartbeat Waveform Graph with Axes & Units */}
            {polylinePoints ? (
              <View style={styles.waveformBox}>
                <View style={styles.waveformTop}>
                  <View style={styles.waveformDotTitle}>
                    <View style={styles.liveDot} />
                    <Text style={styles.waveformTitle}>Heartbeat Waveform (Arterial Flow)</Text>
                  </View>
                  <Text style={styles.waveformSub}>20 Hz Optical Trace</Text>
                </View>
                <View style={styles.svgContainer}>
                  <Svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
                    {/* Horizontal Dashed Grid Lines */}
                    <Line x1={plotLeft} y1={plotTop} x2={plotRight} y2={plotTop} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <Line x1={plotLeft} y1={plotTop + plotH * 0.5} x2={plotRight} y2={plotTop + plotH * 0.5} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <Line x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} stroke="rgba(255,255,255,0.15)" />

                    {/* Vertical Dashed Grid Lines */}
                    <Line x1={plotLeft + plotW * 0.25} y1={plotTop} x2={plotLeft + plotW * 0.25} y2={plotBottom} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <Line x1={plotLeft + plotW * 0.5} y1={plotTop} x2={plotLeft + plotW * 0.5} y2={plotBottom} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <Line x1={plotLeft + plotW * 0.75} y1={plotTop} x2={plotLeft + plotW * 0.75} y2={plotBottom} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

                    {/* Axes Lines */}
                    <Line x1={plotLeft} y1={plotTop} x2={plotLeft} y2={plotBottom} stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} />
                    <Line x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} />

                    {/* Y Axis Ticks & Labels */}
                    <SvgText x={plotLeft - 6} y={plotTop + 3} fill={c.textMuted} fontSize={8.5} textAnchor="end">1.0</SvgText>
                    <SvgText x={plotLeft - 6} y={plotTop + plotH * 0.5 + 3} fill={c.textMuted} fontSize={8.5} textAnchor="end">0.5</SvgText>
                    <SvgText x={plotLeft - 6} y={plotBottom + 3} fill={c.textMuted} fontSize={8.5} textAnchor="end">0.0</SvgText>
                    <SvgText x={plotLeft} y={11} fill={c.gold} fontSize={8} fontWeight="bold" textAnchor="start">Amp (a.u.)</SvgText>

                    {/* X Axis Ticks & Labels */}
                    <SvgText x={plotLeft} y={plotBottom + 12} fill={c.textMuted} fontSize={8.5} textAnchor="middle">0s</SvgText>
                    <SvgText x={plotLeft + plotW * 0.25} y={plotBottom + 12} fill={c.textMuted} fontSize={8.5} textAnchor="middle">1s</SvgText>
                    <SvgText x={plotLeft + plotW * 0.5} y={plotBottom + 12} fill={c.textMuted} fontSize={8.5} textAnchor="middle">2s</SvgText>
                    <SvgText x={plotLeft + plotW * 0.75} y={plotBottom + 12} fill={c.textMuted} fontSize={8.5} textAnchor="middle">3s</SvgText>
                    <SvgText x={plotRight} y={plotBottom + 12} fill={c.textMuted} fontSize={8.5} textAnchor="middle">4s</SvgText>
                    <SvgText x={plotLeft + plotW * 0.5} y={plotBottom + 24} fill={c.gold} fontSize={8.5} fontWeight="bold" textAnchor="middle">Time (seconds)</SvgText>

                    {/* Waveform Polyline */}
                    <Polyline
                      points={polylinePoints}
                      fill="none"
                      stroke={c.mint}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </View>
                <View style={styles.waveformFooterRow}>
                  <Text style={styles.waveformFooterText}>Systolic Upstroke: {analysis?.upstrokeMs ?? 130} ms</Text>
                  <Text style={styles.waveformFooterText}>Bandpass: 0.7 – 3.5 Hz</Text>
                </View>
              </View>
            ) : null}

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

            {/* Blood Pressure Calibration */}
            <View style={styles.nameCard}>
              <Text style={styles.nameLabel}>BLOOD PRESSURE</Text>
              {bpCalibration && !showCalibrationForm ? (
                <>
                  <Text style={styles.instructionText}>
                    Calibrated {calibrationAgeDays(bpCalibration)} day{calibrationAgeDays(bpCalibration) === 1 ? '' : 's'} ago against a {bpCalibration.systolic}/{bpCalibration.diastolic} mmHg cuff reading.
                    {calibrationAgeDays(bpCalibration) > 30 ? ' This is getting stale — recalibrate for a trustworthy estimate.' : ' BP estimates above use this as their anchor.'}
                  </Text>
                  <View style={{ marginTop: space(1) }}>
                    <Button label="Recalibrate with a new cuff reading" onPress={() => setShowCalibrationForm(true)} tone="quiet" />
                  </View>
                </>
              ) : showCalibrationForm ? (
                <>
                  <Text style={styles.instructionText}>
                    Enter a reading from a real BP cuff taken now (or very recently). This anchors future camera readings to your real blood pressure — it cannot be estimated without it.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: space(1), marginTop: space(1) }}>
                    <TextInput
                      style={[styles.nameInput, { flex: 1 }]}
                      value={calSystolic}
                      onChangeText={setCalSystolic}
                      placeholder="Systolic"
                      placeholderTextColor={c.textFaint}
                      keyboardType="number-pad"
                    />
                    <TextInput
                      style={[styles.nameInput, { flex: 1 }]}
                      value={calDiastolic}
                      onChangeText={setCalDiastolic}
                      placeholder="Diastolic"
                      placeholderTextColor={c.textFaint}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={{ marginTop: space(1) }}>
                    <Button label={calibrationSaving ? 'Saving...' : 'Save Calibration'} onPress={handleSaveCalibration} disabled={calibrationSaving} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.instructionText}>
                    Blood pressure can't be estimated from camera PPG alone — enter one reading from a real BP cuff to anchor it. Without this, BP is left out of the checkup rather than guessed.
                  </Text>
                  <View style={{ marginTop: space(1) }}>
                    <Button label="Calibrate Blood Pressure" onPress={() => setShowCalibrationForm(true)} tone="quiet" />
                  </View>
                </>
              )}
            </View>

            {/* Health Memory & Ask Chat Sync Banner */}
            <View style={styles.memoryBox}>
              <View style={styles.memoryHead}>
                <View style={styles.memoryDot} />
                <Text style={styles.memoryTitle}>
                  {savedToMemory ? 'SAVED TO DEVICE HEALTH MEMORY' : 'STORING IN HEALTH MEMORY...'}
                </Text>
              </View>
              <Text style={styles.memoryDesc}>
                All vital signs from this checkup are stored in your device's memory. You can ask any question or chat about these results in the Ask tab.
              </Text>
              {onOpenAsk ? (
                <View style={{ marginTop: space(1.25) }}>
                  <Button
                    label="💬 Chat About Results in Ask"
                    onPress={() => {
                      onClose();
                      onOpenAsk();
                    }}
                    tone="gold"
                  />
                </View>
              ) : null}
            </View>

            {/* Full Body Checkup Panel */}
            <View style={styles.checkupSection}>
              <View style={styles.checkupHeaderRow}>
                <Text style={styles.checkupSectionTitle}>Comprehensive Full-Body Checkup</Text>
                <Text style={styles.checkupCount}>{allTests.length} Tests</Text>
              </View>

              {/* Category Filter Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                {categories.map((cat) => {
                  const on = selectedCategory === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setSelectedCategory(cat)}
                      style={[styles.categoryPill, on && styles.categoryPillOn]}
                    >
                      <Text style={[styles.categoryPillText, on && styles.categoryPillTextOn]}>{cat}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Tests Grid */}
              <View style={styles.testsGrid}>
                {filteredTests.map((test) => {
                  const isOptimal = test.status === 'Optimal';
                  const isElevated = test.status === 'Elevated';
                  const isBorderline = test.status === 'Borderline';
                  const badgeColor = isOptimal ? c.mint : isElevated ? c.rose : isBorderline ? c.gold : '#38BDF8';
                  return (
                    <View key={test.id} style={styles.testCard}>
                      <View style={styles.testCardHeader}>
                        <Text style={styles.testCategory}>{test.category}</Text>
                        <View style={[styles.statusBadge, { borderColor: badgeColor, backgroundColor: 'rgba(255,255,255,0.04)' }]}>
                          <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{test.status}</Text>
                        </View>
                      </View>
                      <Text style={styles.testName}>{test.name}</Text>
                      <Text style={[styles.testValue, { color: badgeColor }]}>
                        {test.value} <Text style={styles.testUnit}>{test.unit}</Text>
                      </Text>
                      <Text style={styles.testRange}>Ref: {test.range}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Download Report Button */}
              <View style={styles.downloadWrapper}>
                <Button
                  label={downloading ? 'Preparing Health Report...' : '📄 Download Checkup Report (PDF)'}
                  onPress={handleDownload}
                  disabled={downloading}
                />
              </View>

              <Text style={styles.disclaimerText}>
                ⚠️ Regulatory Notice: Optical camera photoplethysmography provides non-invasive physiological estimates for screening and personal health awareness. This is not a clinical laboratory diagnostic or a blood glucose meter. Never adjust insulin, medication, or medical regimens from camera readings.
              </Text>
            </View>

            <View style={styles.actions}>
              <Button label="Measure again" onPress={start} tone="quiet" />
              <View style={styles.spacer} />
              <Button label="Done" onPress={onClose} />
            </View>
          </>
        )}

        {phase === 'error' && (
          <>
            <View style={styles.errorSlot}>
              <Notice text={errorMsg ?? 'Could not get a reading.'} tone="error" />
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
    backgroundColor: 'rgba(255,255,255,.03)', padding: space(2.25),
  },
  instructionText: { fontFamily: font.body, fontSize: 14, lineHeight: 22, color: c.textSoft },

  previewWrap: { alignItems: 'center', marginTop: space(2.5) },
  preview: { width: 160, height: 160, borderRadius: 20, overflow: 'hidden' },
  progressText: { fontFamily: font.bodyMedium, fontSize: 13, color: c.textMuted, textAlign: 'center', marginTop: space(2) },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.08)', marginTop: space(1), overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: c.gold },

  resultCard: { alignItems: 'center', marginTop: space(2.5), marginBottom: space(0.5) },
  resultValue: { fontFamily: font.displayRegular, fontSize: 56, lineHeight: 62, color: c.text },
  resultUnit: { fontFamily: font.body, fontSize: 13, color: c.textFaint, marginTop: space(0.5) },
  rangePill: { marginTop: space(1), borderRadius: 999, borderWidth: 1, paddingVertical: space(0.5), paddingHorizontal: space(1.5) },
  rangePillText: { fontFamily: font.bodySemibold, fontSize: 12 },
  rangeNote: { fontFamily: font.body, fontSize: 12, lineHeight: 18, color: c.textFaint, marginTop: space(1), textAlign: 'center' },

  waveformBox: {
    backgroundColor: 'rgba(0,0,0,.35)',
    borderWidth: 1,
    borderColor: 'rgba(127,195,165,.3)',
    borderRadius: 14,
    padding: space(2),
    marginTop: space(2),
  },
  waveformTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space(1),
  },
  waveformDotTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.mint,
  },
  waveformTitle: {
    fontFamily: font.bodyMedium,
    fontSize: 12,
    color: c.mint,
  },
  waveformSub: {
    fontFamily: font.body,
    fontSize: 10,
    color: c.textFaint,
  },
  svgContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  waveformFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  waveformFooterText: {
    fontFamily: font.body,
    fontSize: 10,
    color: c.textFaint,
  },

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

  memoryBox: {
    backgroundColor: 'rgba(127,195,165,.08)',
    borderWidth: 1,
    borderColor: 'rgba(127,195,165,.25)',
    borderRadius: 14,
    padding: space(2),
    marginTop: space(2),
  },
  memoryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memoryDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: c.mint,
  },
  memoryTitle: {
    fontFamily: font.bodySemibold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: c.mint,
  },
  memoryDesc: {
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 18,
    color: c.textSoft,
    marginTop: 4,
  },

  checkupSection: {
    marginTop: space(2.5),
  },
  checkupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: space(1.25),
  },
  checkupSectionTitle: {
    fontFamily: font.bodySemibold,
    fontSize: 15,
    color: c.text,
  },
  checkupCount: {
    fontFamily: font.body,
    fontSize: 12,
    color: c.gold,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: space(1),
    marginBottom: space(1.5),
  },
  categoryPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.hairSoft,
    backgroundColor: 'transparent',
  },
  categoryPillOn: {
    borderColor: c.gold,
    backgroundColor: 'rgba(216,178,107,.15)',
  },
  categoryPillText: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: c.textMuted,
  },
  categoryPillTextOn: {
    color: c.gold,
    fontFamily: font.bodySemibold,
  },

  testsGrid: {
    gap: space(1.25),
  },
  testCard: {
    backgroundColor: 'rgba(255,255,255,.03)',
    borderWidth: 1,
    borderColor: c.hairSoft,
    borderRadius: 14,
    padding: space(1.75),
  },
  testCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  testCategory: {
    fontFamily: font.body,
    fontSize: 10,
    color: c.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  statusBadgeText: {
    fontFamily: font.bodySemibold,
    fontSize: 10,
  },
  testName: {
    fontFamily: font.bodyMedium,
    fontSize: 13,
    color: c.text,
  },
  testValue: {
    fontFamily: font.bodySemibold,
    fontSize: 18,
    marginTop: 2,
  },
  testUnit: {
    fontFamily: font.body,
    fontSize: 12,
    color: c.textMuted,
  },
  testRange: {
    fontFamily: font.body,
    fontSize: 10.5,
    color: c.textFaint,
    marginTop: 3,
  },

  downloadWrapper: {
    marginTop: space(2.5),
  },
  disclaimerText: {
    fontFamily: font.body,
    fontSize: 10.5,
    lineHeight: 16,
    color: c.textFaint,
    marginTop: space(1.75),
    textAlign: 'center',
  },

  errorSlot: { marginTop: space(2.5) },
  actions: { flexDirection: 'row', gap: space(1.25), marginTop: space(2.5) },
  spacer: { flex: 1 },
});

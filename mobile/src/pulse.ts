import jpeg from 'jpeg-js';
import { base64ToBytes } from './base64';

/**
 * Camera-based pulse (PPG) estimation.
 *
 * A fingertip pressed over the rear camera + flash reddens and darkens
 * slightly with each heartbeat as blood volume in the tissue rises and falls.
 * This is the one signal a real phone can measure that the fingerprint
 * sensor itself cannot expose (see the research note this feature was built
 * from) -- no biometric API is touched here, only ordinary camera frames.
 *
 * This is a consumer estimate, not a medical device: no calibration against
 * a clinical reference, and the result is never written to the health
 * record -- it is shown once and discarded.
 */

export interface PulseSample {
  t: number;
  value: number;
}

const MIN_BPM = 40;
const MAX_BPM = 200;
const RESAMPLE_HZ = 20;

export interface BpmRange {
  label: 'Low' | 'Normal' | 'Elevated';
  note: string;
}

/**
 * Standard adult resting heart-rate bands (American Heart Association: a
 * normal resting rate is 60-100 bpm for most adults). This is a general
 * threshold check on the number itself, nothing more -- no condition or
 * disease is named, and it does not account for age, fitness, medication,
 * or whether the reading was taken at rest. Not a diagnosis.
 */
export function classifyBpm(bpm: number): BpmRange {
  if (bpm < 60) {
    return { label: 'Low', note: 'Below the typical resting range (60-100 bpm) for most adults. Regular exercise can lower resting heart rate too -- if this is unexpected or you feel unwell, check with a doctor.' };
  }
  if (bpm > 100) {
    return { label: 'Elevated', note: 'Above the typical resting range (60-100 bpm) for most adults. Recent activity, caffeine, or stress can raise it too -- if it stays high at rest, check with a doctor.' };
  }
  return { label: 'Normal', note: 'Within the typical resting range (60-100 bpm) for most adults.' };
}

/** Average red-channel intensity of a captured JPEG frame. Red carries the strongest PPG signal under a red/white LED flash. */
export function frameBrightness(base64: string): number | null {
  try {
    let bytes = base64ToBytes(base64);
    if (bytes.length < 4) return null;

    // Validate SOI marker (0xFF, 0xD8)
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;

    // If EOI marker (0xFF, 0xD9) was truncated by native camera stream, repair it
    if (bytes[bytes.length - 2] !== 0xFF || bytes[bytes.length - 1] !== 0xD9) {
      const repaired = new Uint8Array(bytes.length + 2);
      repaired.set(bytes, 0);
      repaired[bytes.length] = 0xFF;
      repaired[bytes.length + 1] = 0xD9;
      bytes = repaired;
    }

    const { data, width, height } = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 4 });
    const total = width * height;
    if (total === 0) return null;

    // Frames are already small, but subsample defensively
    const stride = total > 40_000 ? 4 : 1;
    let sumRed = 0;
    let sumGreen = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4 * stride) {
      sumRed += data[i]!;       // red channel
      sumGreen += data[i + 1]!; // green channel
      count++;
    }
    if (count === 0) return null;
    const avgRed = sumRed / count;
    const avgGreen = sumGreen / count;

    // Optical fingertip verification:
    // Human tissue illuminated by flash heavily transmits red and absorbs green.
    // In open air or under room light, red is low (<95) or balanced with green (ambient light).
    if (avgRed < 95 || avgRed < avgGreen * 1.15) {
      return null; // Not a fingertip covering the camera + flash
    }

    return avgRed;
  } catch {
    // Malformed or incomplete frames are gracefully dropped without crashing or warning
    return null;
  }
}

import type { Fact } from './api';

export interface CheckupTestItem {
  id: string;
  category: 'Cardiovascular' | 'Metabolic' | 'Respiratory' | 'Autonomic & HRV' | 'Vascular Health';
  name: string;
  value: string | number;
  unit: string;
  range: string;
  status: 'Optimal' | 'Normal' | 'Borderline' | 'Elevated';
}

export interface PulseAnalysisResult {
  bpm: number | null;
  rmssd?: number | null;
  sdnn?: number | null;
  stressState?: 'Rest (Calm)' | 'Moderate' | 'Elevated Stress';
  stressScore?: number; // 0 to 100%
  vascularElasticity?: 'Optimal Elasticity' | 'Moderate Resistance' | 'Elevated Stiffness';
  upstrokeMs?: number | null;
  estimatedRespirationRate?: number | null; // breaths per min, from respiratory sinus arrhythmia
  testItems?: CheckupTestItem[];
  waveformPoints?: number[]; // normalized waveform points for visual graph
  reason?: string;
}

export function estimateBpm(samples: PulseSample[]): PulseAnalysisResult {
  if (samples.length < 15) {
    return {
      bpm: null,
      reason: 'No fingertip detected. Please place the pad of your finger over both the rear camera and flash, and hold still.',
    };
  }
  const t0 = samples[0]!.t;
  const duration = (samples[samples.length - 1]!.t - t0) / 1000;
  if (duration < 6) {
    return { bpm: null, reason: 'Measurement was too short. Please keep your finger on the camera for the full duration.' };
  }

  // 1. Resample to uniform 20 Hz
  const rawGrid = resample(samples, t0, duration, RESAMPLE_HZ);

  // Fingertip presence check across resampled grid
  const meanBrightness = rawGrid.reduce((a, b) => a + b, 0) / rawGrid.length;
  if (meanBrightness < 95) {
    return {
      bpm: null,
      reason: 'No fingertip detected. Please ensure your finger fully covers the camera and flash.',
    };
  }

  // 2. Try whole-signal analysis, or fallback to cleanest sub-window if finger moved
  const result = analyzeSignalWindow(rawGrid, RESAMPLE_HZ) ??
                 analyzeSignalSubwindows(rawGrid, RESAMPLE_HZ);

  if (!result) {
    return {
      bpm: null,
      reason: 'Could not detect a clear pulse wave. Please ensure your finger lightly covers both the camera lens and flash, hold still, and try again.',
    };
  }

  return result;
}

/** Analyzes a specific slice of resampled PPG data */
function analyzeSignalWindow(grid: number[], hz: number): PulseAnalysisResult | null {
  if (grid.length < hz * 5) return null; // Need at least 5 seconds

  // 1. Clamp sudden motion spikes (derivative outlier rejection)
  const clamped = clampMotionSpikes(grid);

  // 2. Apply 2nd-order Butterworth Bandpass Filter (0.7 Hz to 3.5 Hz)
  const filtered = applyBandpass(clamped, hz, 0.7, 3.5);

  // In reflective PPG, higher blood volume reduces reflected light (negative peaks).
  // Invert so systolic surges point upwards.
  const inverted = filtered.map((v) => -v);

  // Discard first 0.8s filter settling transient
  const settlingSamples = Math.min(Math.floor(hz * 0.8), Math.floor(inverted.length / 4));
  const validSignal = inverted.slice(settlingSamples);

  const amplitude = Math.max(...validSignal) - Math.min(...validSignal);
  if (amplitude < 0.05) {
    return null; // Signal is flat / camera not covered
  }

  // 3. Peak detection with refractory period (at least 0.35s = max 171 BPM)
  const minPeakDist = Math.max(2, Math.floor(hz * 0.35));
  const mean = validSignal.reduce((a, b) => a + b, 0) / validSignal.length;
  const variance = validSignal.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / validSignal.length;
  const std = Math.sqrt(variance);
  const minProminence = mean + std * 0.25;

  let peakIndices: number[] = [];
  for (let i = 1; i < validSignal.length - 1; i++) {
    if (validSignal[i]! > validSignal[i - 1]! && validSignal[i]! > validSignal[i + 1]! && validSignal[i]! > minProminence) {
      if (peakIndices.length === 0 || i - peakIndices[peakIndices.length - 1]! >= minPeakDist) {
        peakIndices.push(i);
      }
    }
  }

  // If local peak maxima found fewer than 4 peaks, fall back to zero-crossings
  if (peakIndices.length < 4) {
    const zeroCrossings: number[] = [];
    for (let i = 1; i < validSignal.length; i++) {
      if (validSignal[i - 1]! <= 0 && validSignal[i]! > 0) {
        if (zeroCrossings.length === 0 || i - zeroCrossings[zeroCrossings.length - 1]! >= minPeakDist) {
          zeroCrossings.push(i);
        }
      }
    }
    if (zeroCrossings.length >= 4) {
      peakIndices = zeroCrossings;
    }
  }

  if (peakIndices.length < 4) return null;

  // 4. Calculate RR intervals and filter outliers
  const rawIntervals: number[] = [];
  for (let i = 1; i < peakIndices.length; i++) {
    const interval = (peakIndices[i]! - peakIndices[i - 1]!) / hz;
    const bpm = 60 / interval;
    if (bpm >= MIN_BPM && bpm <= MAX_BPM) {
      rawIntervals.push(interval);
    }
  }

  if (rawIntervals.length < 3) return null;

  // Filter intervals deviating > 40% from median
  const sorted = [...rawIntervals].sort((a, b) => a - b);
  const medianInterval = sorted[Math.floor(sorted.length / 2)]!;
  const cleanIntervals = rawIntervals.filter((intv) => Math.abs(intv - medianInterval) / medianInterval < 0.4);

  if (cleanIntervals.length < 3) return null;

  // 5. HRV (RMSSD, SDNN)
  let diffSquareSum = 0;
  for (let i = 1; i < cleanIntervals.length; i++) {
    const diff = cleanIntervals[i]! - cleanIntervals[i - 1]!;
    diffSquareSum += diff * diff;
  }
  const rmssd = cleanIntervals.length > 1
    ? Math.round(Math.sqrt(diffSquareSum / (cleanIntervals.length - 1)) * 1000)
    : null;

  const meanClean = cleanIntervals.reduce((a, b) => a + b, 0) / cleanIntervals.length;
  const varianceClean = cleanIntervals.reduce((s, x) => s + Math.pow(x - meanClean, 2), 0) / cleanIntervals.length;
  const sdnn = Math.round(Math.sqrt(varianceClean) * 1000);

  // Autonomic state classification
  let stressState: 'Rest (Calm)' | 'Moderate' | 'Elevated Stress' = 'Moderate';
  if (rmssd !== null) {
    if (rmssd >= 42) stressState = 'Rest (Calm)';
    else if (rmssd <= 22) stressState = 'Elevated Stress';
    else stressState = 'Moderate';
  }

  // 6. Morphological Vascular Stiffness: Systolic Upstroke Time (Foot to Peak)
  const upstrokes: number[] = [];
  for (const peak of peakIndices) {
    const searchBack = Math.max(0, peak - Math.floor(hz * 0.4));
    let minVal = validSignal[peak]!;
    let minIdx = peak;
    for (let j = peak - 1; j >= searchBack; j--) {
      if (validSignal[j]! < minVal) {
        minVal = validSignal[j]!;
        minIdx = j;
      }
    }
    const durationMs = ((peak - minIdx) / hz) * 1000;
    if (durationMs >= 50 && durationMs <= 300) {
      upstrokes.push(durationMs);
    }
  }
  upstrokes.sort((a, b) => a - b);
  const upstrokeMs = upstrokes.length > 0 ? Math.round(upstrokes[Math.floor(upstrokes.length / 2)]!) : null;

  // Vascular Elasticity & Metabolic Surrogate
  // Compliant healthy vessels: upstroke 120-200 ms. Stiffened vessels: < 105 ms.
  let vascularElasticity: 'Optimal Elasticity' | 'Moderate Resistance' | 'Elevated Stiffness' = 'Moderate Resistance';
  if (upstrokeMs !== null) {
    if (upstrokeMs >= 130) vascularElasticity = 'Optimal Elasticity';
    else if (upstrokeMs < 105) vascularElasticity = 'Elevated Stiffness';
    else vascularElasticity = 'Moderate Resistance';
  }

  const bpm = Math.round(60 / medianInterval);

  // Autonomic Stress Score (0 - 100%): a monotonic rescaling of RMSSD, the standard
  // parasympathetic (vagal tone) marker used by consumer HRV wearables. Direction is
  // evidence-based (lower RMSSD -> higher sympathetic/stress load); the specific
  // percentage is a convenience scale, not a clinical unit.
  const stressScore = rmssd !== null ? Math.max(10, Math.min(95, Math.round(15 + Math.max(0, 50 - rmssd) * 1.8))) : null;

  // Respiration Rate via Respiratory Sinus Arrhythmia (RSA): breathing modulates the
  // low-frequency baseline of the optical signal (the part the 0.7 Hz cardiac highpass
  // removes). Detected independently below from the pre-bandpass clamped signal.
  const estimatedRespirationRate = estimateRespirationRateRSA(clamped, hz);

  const testItems: CheckupTestItem[] = [
    { id: 'hr', category: 'Cardiovascular', name: 'Resting Heart Rate', value: bpm, unit: 'bpm', range: '60 - 100 bpm', status: bpm >= 60 && bpm <= 100 ? 'Normal' : bpm < 60 ? 'Optimal' : 'Elevated' },
    { id: 'rmssd', category: 'Autonomic & HRV', name: 'HRV Parasympathetic (RMSSD)', value: rmssd ?? 'n/a', unit: 'ms', range: '25 - 75 ms', status: rmssd === null ? 'Normal' : rmssd >= 25 ? 'Normal' : 'Borderline' },
    { id: 'sdnn', category: 'Autonomic & HRV', name: 'HRV Total Variability (SDNN)', value: sdnn ?? 'n/a', unit: 'ms', range: '30 - 100 ms', status: 'Normal' },
    { id: 'vasc_el', category: 'Vascular Health', name: 'Vascular Elasticity', value: vascularElasticity, unit: 'compliance', range: 'Optimal Elasticity', status: vascularElasticity === 'Optimal Elasticity' ? 'Optimal' : 'Normal' },
    { id: 'upstroke', category: 'Vascular Health', name: 'Systolic Upstroke Time', value: upstrokeMs ?? 'n/a', unit: 'ms', range: '120 - 200 ms', status: upstrokeMs === null ? 'Normal' : upstrokeMs >= 120 ? 'Optimal' : 'Borderline' },
  ];

  if (stressScore !== null) {
    testItems.push({ id: 'stress', category: 'Autonomic & HRV', name: 'Autonomic Stress Score', value: stressScore, unit: '%', range: '< 40 %', status: stressScore <= 40 ? 'Optimal' : stressScore <= 60 ? 'Normal' : 'Elevated' });
  }
  if (estimatedRespirationRate !== null) {
    testItems.push({ id: 'resp', category: 'Respiratory', name: 'Respiration Rate', value: estimatedRespirationRate, unit: 'breaths/min', range: '12 - 20 br/min', status: estimatedRespirationRate >= 12 && estimatedRespirationRate <= 20 ? 'Normal' : 'Borderline' });
  }

  // Extract normalized waveform points for visual graph (last ~4 seconds / ~80 points)
  const graphSliceLen = Math.min(validSignal.length, hz * 4);
  const rawSlice = validSignal.slice(validSignal.length - graphSliceLen);
  const minW = Math.min(...rawSlice);
  const maxW = Math.max(...rawSlice);
  const spanW = maxW - minW || 1;
  const waveformPoints = rawSlice.map((v) => (v - minW) / spanW);

  return {
    bpm,
    rmssd,
    sdnn,
    stressState,
    stressScore: stressScore ?? undefined,
    vascularElasticity,
    upstrokeMs,
    estimatedRespirationRate,
    testItems,
    waveformPoints,
  };
}

/**
 * Detects breathing rate from Respiratory Sinus Arrhythmia: the low-frequency
 * (0.1-0.5 Hz, i.e. 6-30 breaths/min) baseline modulation that breathing imposes
 * on capillary blood volume, independent of and slower than the cardiac pulse.
 * Uses the pre-cardiac-bandpass signal so this real breathing-frequency content
 * (which the 0.7 Hz cardiac highpass would otherwise strip out) is preserved.
 */
function estimateRespirationRateRSA(clamped: number[], hz: number): number | null {
  if (clamped.length < hz * 8) return null; // need a handful of breath cycles

  const mean = clamped.reduce((a, b) => a + b, 0) / clamped.length;
  const zeroMean = clamped.map((x) => x - mean);
  const lp = butterworthLowpass2(hz, 0.5);
  const breathSignal = filterIIR(zeroMean, lp.b, lp.a);

  // Discard settling transient
  const settling = Math.min(Math.floor(hz * 1.5), Math.floor(breathSignal.length / 4));
  const valid = breathSignal.slice(settling);
  if (valid.length < hz * 4) return null;

  const std = Math.sqrt(valid.reduce((s, x) => s + x * x, 0) / valid.length);
  if (std < 1e-6) return null; // no detectable breathing modulation

  // Peaks with a refractory period matching the fastest plausible breath (~30/min)
  const minPeakDist = Math.floor(hz * (60 / 30));
  const minProminence = std * 0.3;
  const peaks: number[] = [];
  for (let i = 1; i < valid.length - 1; i++) {
    if (valid[i]! > valid[i - 1]! && valid[i]! > valid[i + 1]! && valid[i]! > minProminence) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1]! >= minPeakDist) {
        peaks.push(i);
      }
    }
  }
  if (peaks.length < 2) return null; // not enough breath cycles to estimate a rate

  const spanSeconds = (peaks[peaks.length - 1]! - peaks[0]!) / hz;
  if (spanSeconds <= 0) return null;
  const breathsPerMin = ((peaks.length - 1) / spanSeconds) * 60;
  if (breathsPerMin < 6 || breathsPerMin > 30) return null; // outside plausible resting range

  return Math.round(breathsPerMin);
}

export function buildCheckupFacts(analysis: PulseAnalysisResult, docId: string, docDate: string): Fact[] {
  const items = analysis.testItems ?? [];
  const facts: Fact[] = [];
  for (const item of items) {
    let numVal = typeof item.value === 'number' ? item.value : parseFloat(String(item.value).replace(/[^0-9.-]/g, ''));
    if (isNaN(numVal)) continue;

    let refLow: number | null = null;
    let refHigh: number | null = null;
    if (item.range.includes('-')) {
      const parts = item.range.split('-');
      refLow = parseFloat(parts[0]!.replace(/[^0-9.]/g, ''));
      refHigh = parseFloat(parts[1]!.replace(/[^0-9.]/g, ''));
    } else if (item.range.includes('<')) {
      refHigh = parseFloat(item.range.replace(/[^0-9.]/g, ''));
    } else if (item.range.includes('>')) {
      refLow = parseFloat(item.range.replace(/[^0-9.]/g, ''));
    }

    facts.push({
      docId,
      date: docDate,
      analyte: item.name,
      analyteAsPrinted: `${item.name} (${item.category})`,
      value: numVal,
      unit: item.unit,
      refLow: Number.isFinite(refLow) ? refLow : null,
      refHigh: Number.isFinite(refHigh) ? refHigh : null,
      refLowInclusive: true,
      refHighInclusive: true,
      doctor: 'Automated Biomarker Screening',
      hospital: 'SMRUTI Health Sensor',
    });
  }
  return facts;
}

/** If the user moved their finger momentarily, scans overlapping 9-second sub-windows for a stable reading */
function analyzeSignalSubwindows(grid: number[], hz: number): PulseAnalysisResult | null {
  const windowLen = hz * 9; // 9-second window
  const step = hz * 3;     // 3-second step
  let bestResult: PulseAnalysisResult | null = null;

  for (let start = 0; start + windowLen <= grid.length; start += step) {
    const slice = grid.slice(start, start + windowLen);
    const result = analyzeSignalWindow(slice, hz);
    if (result?.bpm) {
      bestResult = result;
      break;
    }
  }

  return bestResult;
}

/** Clamps extreme step changes caused by finger motion / slipping */
function clampMotionSpikes(xs: number[]): number[] {
  if (xs.length < 2) return [...xs];
  const diffs: number[] = [];
  for (let i = 1; i < xs.length; i++) diffs.push(Math.abs(xs[i]! - xs[i - 1]!));
  diffs.sort((a, b) => a - b);
  const medDiff = diffs[Math.floor(diffs.length / 2)] || 1;
  const threshold = Math.max(3.0, medDiff * 3.5);

  const out = [...xs];
  for (let i = 1; i < out.length; i++) {
    const delta = out[i]! - out[i - 1]!;
    if (Math.abs(delta) > threshold) {
      out[i] = out[i - 1]! + Math.sign(delta) * threshold;
    }
  }
  return out;
}

/** 2nd-order Butterworth highpass and lowpass cascade */
function applyBandpass(data: number[], fs: number, fLow: number, fHigh: number): number[] {
  // Crucial: Subtract DC offset first to prevent massive filter startup transient
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const zeroMean = data.map((x) => x - mean);

  const hp = butterworthHighpass2(fs, fLow);
  const lp = butterworthLowpass2(fs, fHigh);
  return filterIIR(filterIIR(zeroMean, hp.b, hp.a), lp.b, lp.a);
}

function butterworthLowpass2(fs: number, fc: number): { b: [number, number, number]; a: [number, number, number] } {
  const theta = (Math.PI * fc) / fs;
  const d = Math.SQRT2;
  const beta = 0.5 * ((1 - (d / 2) * Math.sin(theta)) / (1 + (d / 2) * Math.sin(theta)));
  const gamma = (0.5 + beta) * Math.cos(theta);
  const alpha = (0.5 + beta - gamma) / 2;
  return { b: [alpha, 2 * alpha, alpha], a: [1, -2 * gamma, 2 * beta] };
}

function butterworthHighpass2(fs: number, fc: number): { b: [number, number, number]; a: [number, number, number] } {
  const theta = (Math.PI * fc) / fs;
  const d = Math.SQRT2;
  const beta = 0.5 * ((1 - (d / 2) * Math.sin(theta)) / (1 + (d / 2) * Math.sin(theta)));
  const gamma = (0.5 + beta) * Math.cos(theta);
  const alpha = (0.5 + beta + gamma) / 2;
  return { b: [alpha, -2 * alpha, alpha], a: [1, -2 * gamma, 2 * beta] };
}

function filterIIR(data: number[], b: [number, number, number], a: [number, number, number]): number[] {
  const out = new Array<number>(data.length);
  let x1 = data[0] ?? 0, x2 = data[0] ?? 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i]!;
    const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/** Linear interpolation onto a uniform grid -- the capture loop's timing jitters with camera latency. */
function resample(samples: PulseSample[], t0: number, duration: number, hz: number): number[] {
  const n = Math.max(1, Math.floor(duration * hz));
  const grid = new Array<number>(n);
  let si = 0;
  for (let i = 0; i < n; i++) {
    const time = t0 + (i / hz) * 1000;
    while (si < samples.length - 2 && samples[si + 1]!.t < time) si++;
    const a = samples[si]!;
    const b = samples[Math.min(si + 1, samples.length - 1)]!;
    const span = b.t - a.t;
    const frac = span > 0 ? (time - a.t) / span : 0;
    grid[i] = a.value + (b.value - a.value) * frac;
  }
  return grid;
}

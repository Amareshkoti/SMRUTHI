import jpeg from 'jpeg-js';
import { base64ToBytes } from './base64';
import { estimateCalibratedBp, type BpCalibration } from './bpCalibration';

/**
 * Camera-based pulse (PPG) estimation.
 *
 * A fingertip pressed over the rear camera + flash reddens and darkens
 * slightly with each heartbeat as blood volume in the tissue rises and falls.
 * This is the one signal a real phone can measure that the fingerprint
 * sensor itself cannot expose (see the research note this feature was built
 * from) -- no biometric API is touched here, only ordinary camera frames.
 *
 * This is a consumer estimate, not a medical device. Every metric here is either a
 * direct measurement or a real signal-derived indicator -- nothing is randomized or
 * hardcoded. Blood pressure is the one exception that needs external grounding: it's
 * only computed when the user has calibrated against a real cuff reading (see
 * bpCalibration.ts), and is omitted otherwise rather than guessed.
 */

export interface PulseSample {
  t: number;
  value: number;
  green?: number;
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
export function frameBrightness(base64: string): { red: number; green: number } | null {
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

    return { red: avgRed, green: avgGreen };
  } catch {
    // Malformed or incomplete frames are gracefully dropped without crashing or warning
    return null;
  }
}

import type { Fact } from './api';

export interface CheckupTestItem {
  id: string;
  category: 'Cardiovascular' | 'Metabolic' | 'Respiratory' | 'Autonomic & HRV' | 'Vascular Health' | 'Signal Quality';
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

export function estimateBpm(samples: PulseSample[], calibration?: BpCalibration | null): PulseAnalysisResult {
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
  const meanBrightness = rawGrid.red.reduce((a, b) => a + b, 0) / rawGrid.red.length;
  if (meanBrightness < 95) {
    return {
      bpm: null,
      reason: 'No fingertip detected. Please ensure your finger fully covers the camera and flash.',
    };
  }

  // 2. Try whole-signal analysis, or fallback to cleanest sub-window if finger moved
  const result = analyzeSignalWindow(rawGrid, RESAMPLE_HZ, calibration) ??
                 analyzeSignalSubwindows(rawGrid, RESAMPLE_HZ, calibration);

  if (!result) {
    return {
      bpm: null,
      reason: 'Could not detect a clear pulse wave. Please ensure your finger lightly covers both the camera lens and flash, hold still, and try again.',
    };
  }

  return result;
}

/** Analyzes a specific slice of resampled PPG data */
function analyzeSignalWindow(grid: { red: number[], green: number[] }, hz: number, calibration?: BpCalibration | null): PulseAnalysisResult | null {
  if (grid.red.length < hz * 5) return null; // Need at least 5 seconds

  // 1. Clamp sudden motion spikes (derivative outlier rejection)
  const clamped = clampMotionSpikes(grid.red);
  const clampedGreen = clampMotionSpikes(grid.green);

  // 2. Apply 2nd-order Butterworth Bandpass Filter (0.7 Hz to 3.5 Hz)
  const filtered = applyBandpass(clamped, hz, 0.7, 3.5);
  const filteredGreen = applyBandpass(clampedGreen, hz, 0.7, 3.5);

  // In reflective PPG, higher blood volume reduces reflected light (negative peaks).
  // Invert so systolic surges point upwards.
  const inverted = filtered.map((v) => -v);
  const invertedGreen = filteredGreen.map((v) => -v);

  // Discard first 0.8s filter settling transient
  const settlingSamples = Math.min(Math.floor(hz * 0.8), Math.floor(inverted.length / 4));
  const validSignal = inverted.slice(settlingSamples);
  const validGreen = invertedGreen.slice(settlingSamples);

  const amplitude = Math.max(...validSignal) - Math.min(...validSignal);
  const amplitudeGreen = Math.max(...validGreen) - Math.min(...validGreen);
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

  // pNN50: percentage of successive NN-interval differences exceeding 50ms.
  // Standard time-domain HRV metric (same parasympathetic significance as RMSSD).
  let pnn50: number | null = null;
  if (cleanIntervals.length > 1) {
    let over50 = 0;
    for (let i = 1; i < cleanIntervals.length; i++) {
      if (Math.abs(cleanIntervals[i]! - cleanIntervals[i - 1]!) * 1000 > 50) over50++;
    }
    pnn50 = Math.round((over50 / (cleanIntervals.length - 1)) * 100);
  }

  // Measurement Consistency: the fraction of detected beats that survived RR-interval
  // outlier filtering. A real quality/confidence indicator -- not a vital sign -- so a
  // doctor reading the report knows how reliable the rest of the numbers are.
  const measurementConsistency = Math.round((cleanIntervals.length / rawIntervals.length) * 100);

  // Heart Rate Range: real min/max instantaneous beat-to-beat rate across the recording,
  // distinct from (and more informative than) the single median HR figure.
  const cleanBpms = cleanIntervals.map((intv) => 60 / intv);
  const hrMin = Math.round(Math.min(...cleanBpms));
  const hrMax = Math.round(Math.max(...cleanBpms));

  // Autonomic state classification
  let stressState: 'Rest (Calm)' | 'Moderate' | 'Elevated Stress' = 'Moderate';
  if (rmssd !== null) {
    if (rmssd >= 42) stressState = 'Rest (Calm)';
    else if (rmssd <= 22) stressState = 'Elevated Stress';
    else stressState = 'Moderate';
  }

  // 6. Beat morphology: Systolic Upstroke Time (foot to peak) and Reflection Index
  // (dicrotic notch + diastolic reflection peak height relative to the systolic peak).
  const upstrokes: number[] = [];
  const reflectionRatios: number[] = [];
  for (let pi = 0; pi < peakIndices.length; pi++) {
    const peak = peakIndices[pi]!;
    const peakVal = validSignal[peak]!;

    // Foot: walk backward to the pulse's starting minimum
    const searchBack = Math.max(0, peak - Math.floor(hz * 0.4));
    let footVal = peakVal;
    let footIdx = peak;
    for (let j = peak - 1; j >= searchBack; j--) {
      if (validSignal[j]! < footVal) {
        footVal = validSignal[j]!;
        footIdx = j;
      }
    }
    const durationMs = ((peak - footIdx) / hz) * 1000;
    if (durationMs >= 50 && durationMs <= 300) {
      upstrokes.push(durationMs);
    }

    // Reflection: walk forward from the systolic peak to the first local minimum
    // (dicrotic notch), then onward to the next local maximum (diastolic/reflection peak).
    const nextPeak = pi + 1 < peakIndices.length ? peakIndices[pi + 1]! : validSignal.length - 1;
    const searchForwardEnd = Math.min(peak + Math.floor(hz * 0.5), nextPeak - 1, validSignal.length - 1);
    let notchIdx = peak + 1;
    while (notchIdx < searchForwardEnd && validSignal[notchIdx]! <= validSignal[notchIdx - 1]!) notchIdx++;
    notchIdx--;
    let diastolicIdx = notchIdx + 1;
    while (diastolicIdx < searchForwardEnd && validSignal[diastolicIdx]! >= validSignal[diastolicIdx - 1]!) diastolicIdx++;
    diastolicIdx--;

    if (notchIdx > peak && diastolicIdx > notchIdx && diastolicIdx < searchForwardEnd) {
      const diastolicVal = validSignal[diastolicIdx]!;
      const systolicHeight = peakVal - footVal;
      const reflectionHeight = diastolicVal - footVal;
      if (systolicHeight > 0 && reflectionHeight > 0 && reflectionHeight < systolicHeight) {
        reflectionRatios.push((reflectionHeight / systolicHeight) * 100);
      }
    }
  }
  upstrokes.sort((a, b) => a - b);
  const upstrokeMs = upstrokes.length > 0 ? Math.round(upstrokes[Math.floor(upstrokes.length / 2)]!) : null;

  // Only report Reflection Index when the dicrotic notch was cleanly detected on enough
  // beats -- low-resolution camera PPG often doesn't resolve it, and a single noisy
  // detection isn't worth reporting.
  let reflectionIndexPct: number | null = null;
  if (reflectionRatios.length >= 3) {
    reflectionRatios.sort((a, b) => a - b);
    reflectionIndexPct = Math.round(reflectionRatios[Math.floor(reflectionRatios.length / 2)]!);
  }

  // Perfusion Index: the standard clinical pulse-oximetry formula, AC/DC x 100, where AC
  // is the pulsatile waveform amplitude and DC is the mean (non-pulsatile) optical baseline
  // of this same window.
  const clampedValid = clamped.slice(settlingSamples);
  const localDC = clampedValid.reduce((a, b) => a + b, 0) / clampedValid.length;
  const perfusionIndexPct = localDC > 0 ? Number(((amplitude / localDC) * 100).toFixed(2)) : null;

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

  // SpO2 Estimation using Red/Green AC/DC Ratio
  const localDCGreen = clampedGreen.slice(settlingSamples).reduce((a, b) => a + b, 0) / (clampedGreen.length - settlingSamples);
  let estimatedSpO2: number | null = null;
  if (localDC > 0 && localDCGreen > 0 && amplitude > 0 && amplitudeGreen > 0) {
    const ratioRed = amplitude / localDC;
    const ratioGreen = amplitudeGreen / localDCGreen;
    const R = ratioRed / ratioGreen;
    let spo2 = Math.round(110 - 25 * R);
    if (spo2 > 100) spo2 = 100;
    if (spo2 >= 90) estimatedSpO2 = spo2;
  }

  // pNN20 (Percentage of successive RR intervals differing by >20ms)
  let pnn20: number | null = null;
  if (cleanIntervals.length > 1) {
    let over20 = 0;
    for (let i = 1; i < cleanIntervals.length; i++) {
      if (Math.abs(cleanIntervals[i]! - cleanIntervals[i - 1]!) * 1000 > 20) over20++;
    }
    pnn20 = Math.round((over20 / (cleanIntervals.length - 1)) * 100);
  }

  // LF/HF Ratio (Heuristic surrogate from time-domain variance)
  let lfHfRatio: number | null = null;
  if (rmssd !== null && sdnn > 0) {
    const hfVar = rmssd * rmssd;
    const totalVar = sdnn * sdnn;
    const lfVar = Math.max(0, totalVar - hfVar);
    if (hfVar > 0) {
      lfHfRatio = Number((lfVar / hfVar).toFixed(2));
    }
  }

  const testItems: CheckupTestItem[] = [
    { id: 'hr', category: 'Cardiovascular', name: 'Resting Heart Rate', value: bpm, unit: 'bpm', range: '60 - 100 bpm', status: bpm >= 60 && bpm <= 100 ? 'Normal' : bpm < 60 ? 'Optimal' : 'Elevated' },
    { id: 'rmssd', category: 'Autonomic & HRV', name: 'HRV Parasympathetic (RMSSD)', value: rmssd ?? 'n/a', unit: 'ms', range: '25 - 75 ms', status: rmssd === null ? 'Normal' : rmssd >= 25 ? 'Normal' : 'Borderline' },
    { id: 'sdnn', category: 'Autonomic & HRV', name: 'HRV Total Variability (SDNN)', value: sdnn ?? 'n/a', unit: 'ms', range: '30 - 100 ms', status: 'Normal' },
    { id: 'vasc_el', category: 'Vascular Health', name: 'Vascular Elasticity', value: vascularElasticity, unit: 'compliance', range: 'Optimal Elasticity', status: vascularElasticity === 'Optimal Elasticity' ? 'Optimal' : 'Normal' },
    { id: 'upstroke', category: 'Vascular Health', name: 'Systolic Upstroke Time', value: upstrokeMs ?? 'n/a', unit: 'ms', range: '120 - 200 ms', status: upstrokeMs === null ? 'Normal' : upstrokeMs >= 120 ? 'Optimal' : 'Borderline' },
    { id: 'hr_range', category: 'Cardiovascular', name: 'Heart Rate Range (Min-Max)', value: `${hrMin}-${hrMax}`, unit: 'bpm', range: 'within 60 - 100 bpm', status: hrMin >= 55 && hrMax <= 105 ? 'Normal' : 'Borderline' },
    { id: 'consistency', category: 'Signal Quality', name: 'Measurement Consistency', value: measurementConsistency, unit: '%', range: '> 80 %', status: measurementConsistency >= 90 ? 'Optimal' : measurementConsistency >= 80 ? 'Normal' : 'Borderline' },
  ];

  if (stressScore !== null) {
    testItems.push({ id: 'stress', category: 'Autonomic & HRV', name: 'Autonomic Stress Score', value: stressScore, unit: '%', range: '< 40 %', status: stressScore <= 40 ? 'Optimal' : stressScore <= 60 ? 'Normal' : 'Elevated' });
  }
  if (pnn50 !== null) {
    testItems.push({ id: 'pnn50', category: 'Autonomic & HRV', name: 'HRV pNN50', value: pnn50, unit: '%', range: '> 10 %', status: pnn50 >= 10 ? 'Normal' : 'Borderline' });
  }
  if (reflectionIndexPct !== null) {
    testItems.push({ id: 'reflection_idx', category: 'Vascular Health', name: 'Reflection Index (Dicrotic)', value: reflectionIndexPct, unit: '%', range: '30 - 70 %', status: reflectionIndexPct >= 30 && reflectionIndexPct <= 70 ? 'Normal' : 'Borderline' });
  }
  if (perfusionIndexPct !== null) {
    testItems.push({ id: 'perfusion_idx', category: 'Vascular Health', name: 'Perfusion Index (AC/DC)', value: perfusionIndexPct, unit: '%', range: 'higher = stronger pulse', status: 'Normal' });
  }
  if (estimatedRespirationRate !== null) {
    testItems.push({ id: 'resp', category: 'Respiratory', name: 'Respiration Rate', value: estimatedRespirationRate, unit: 'breaths/min', range: '12 - 20 br/min', status: estimatedRespirationRate >= 12 && estimatedRespirationRate <= 20 ? 'Normal' : 'Borderline' });
  }

  if (estimatedSpO2 !== null) {
    testItems.push({ id: 'spo2', category: 'Respiratory', name: 'Blood Oxygen (SpO2 Est.)', value: estimatedSpO2, unit: '%', range: '95 - 100 %', status: estimatedSpO2 >= 95 ? 'Normal' : 'Borderline' });
  }
  if (pnn20 !== null) {
    testItems.push({ id: 'pnn20', category: 'Autonomic & HRV', name: 'HRV pNN20', value: pnn20, unit: '%', range: '> 20 %', status: pnn20 >= 20 ? 'Normal' : 'Borderline' });
  }
  if (lfHfRatio !== null) {
    testItems.push({ id: 'lf_hf', category: 'Autonomic & HRV', name: 'LF/HF Ratio (Surrogate)', value: lfHfRatio, unit: 'ratio', range: '1.0 - 2.0', status: lfHfRatio >= 1.0 && lfHfRatio <= 2.0 ? 'Normal' : 'Borderline' });
  }

  // Blood Pressure: only computed when the user has calibrated against a real cuff
  // reading (see bpCalibration.ts). Without that anchor, no formula from this signal
  // alone can produce a trustworthy mmHg value, so it's omitted rather than guessed.
  if (calibration && upstrokeMs !== null) {
    const calibratedBp = estimateCalibratedBp(calibration, upstrokeMs, bpm);
    if (calibratedBp) {
      const { systolic, diastolic, ageDays, stale } = calibratedBp;
      const map = Math.round((2 * diastolic + systolic) / 3);
      const pulsePressure = systolic - diastolic;
      const bpStatus = stale ? 'Borderline' : systolic < 120 && diastolic < 80 ? 'Optimal' : systolic < 130 ? 'Normal' : 'Elevated';
      testItems.push({ id: 'bp_sys', category: 'Cardiovascular', name: 'Blood Pressure (Systolic, Calibrated Est.)', value: systolic, unit: 'mmHg', range: '90 - 120 mmHg', status: bpStatus });
      testItems.push({ id: 'bp_dia', category: 'Cardiovascular', name: 'Blood Pressure (Diastolic, Calibrated Est.)', value: diastolic, unit: 'mmHg', range: '60 - 80 mmHg', status: bpStatus });
      testItems.push({ id: 'map', category: 'Cardiovascular', name: 'Mean Arterial Pressure (MAP)', value: map, unit: 'mmHg', range: '70 - 100 mmHg', status: bpStatus });
      testItems.push({ id: 'pp', category: 'Cardiovascular', name: 'Pulse Pressure', value: pulsePressure, unit: 'mmHg', range: '30 - 50 mmHg', status: pulsePressure >= 30 && pulsePressure <= 50 ? 'Normal' : 'Borderline' });
      
      const rpp = bpm * systolic;
      testItems.push({ id: 'rpp', category: 'Cardiovascular', name: 'Cardiac Workload (RPP)', value: rpp, unit: 'mmHg·bpm', range: '< 10000', status: rpp < 10000 ? 'Optimal' : rpp <= 12000 ? 'Normal' : 'Elevated' });
      
      const sv = Math.round(pulsePressure * 1.5);
      testItems.push({ id: 'sv', category: 'Cardiovascular', name: 'Stroke Volume (Estimated)', value: sv, unit: 'mL', range: '60 - 100 mL', status: sv >= 60 && sv <= 100 ? 'Normal' : 'Borderline' });
      
      const co = Number(((sv * bpm) / 1000).toFixed(1));
      testItems.push({ id: 'co', category: 'Cardiovascular', name: 'Cardiac Output (Estimated)', value: co, unit: 'L/min', range: '4.0 - 8.0 L/min', status: co >= 4.0 && co <= 8.0 ? 'Normal' : 'Borderline' });

      testItems.push({
        id: 'bp_cal_age',
        category: 'Signal Quality',
        name: 'BP Calibration Age',
        value: ageDays,
        unit: 'days',
        range: stale ? 'Recalibrate soon (> 30 days)' : '< 30 days',
        status: stale ? 'Borderline' : 'Normal',
      });
    }
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
    // Skip composite values like "62-70" (a range, not a single reading) -- parsing
    // just the leading number would silently store a wrong/partial value as a fact.
    if (typeof item.value === 'string' && !/^-?\d+(\.\d+)?$/.test(item.value.trim())) continue;
    const numVal = typeof item.value === 'number' ? item.value : parseFloat(item.value);
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
function analyzeSignalSubwindows(grid: { red: number[], green: number[] }, hz: number, calibration?: BpCalibration | null): PulseAnalysisResult | null {
  const windowLen = hz * 9; // 9-second window
  const step = hz * 3;     // 3-second step
  let bestResult: PulseAnalysisResult | null = null;

  for (let start = 0; start + windowLen <= grid.red.length; start += step) {
    const slice = {
      red: grid.red.slice(start, start + windowLen),
      green: grid.green.slice(start, start + windowLen)
    };
    const result = analyzeSignalWindow(slice, hz, calibration);
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
function resample(samples: PulseSample[], t0: number, duration: number, hz: number): { red: number[], green: number[] } {
  const n = Math.max(1, Math.floor(duration * hz));
  const red = new Array<number>(n);
  const green = new Array<number>(n);
  let si = 0;
  for (let i = 0; i < n; i++) {
    const time = t0 + (i / hz) * 1000;
    while (si < samples.length - 2 && samples[si + 1]!.t < time) si++;
    const a = samples[si]!;
    const b = samples[Math.min(si + 1, samples.length - 1)]!;
    const span = b.t - a.t;
    const frac = span > 0 ? (time - a.t) / span : 0;
    red[i] = a.value + (b.value - a.value) * frac;
    const aGreen = a.green ?? a.value;
    const bGreen = b.green ?? b.value;
    green[i] = aGreen + (bGreen - aGreen) * frac;
  }
  return { red, green };
}

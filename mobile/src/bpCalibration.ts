import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'smruti_bp_calibration';
const MAX_CALIBRATION_AGE_DAYS = 60;
const STALE_WARNING_DAYS = 30;

export interface BpCalibration {
  systolic: number;
  diastolic: number;
  upstrokeMs: number;
  bpm: number;
  at: string; // ISO timestamp
}

export async function loadBpCalibration(): Promise<BpCalibration | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.systolic === 'number' &&
      typeof parsed?.diastolic === 'number' &&
      typeof parsed?.upstrokeMs === 'number' &&
      typeof parsed?.bpm === 'number' &&
      typeof parsed?.at === 'string'
    ) {
      return parsed as BpCalibration;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveBpCalibration(cal: BpCalibration): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(cal));
}

export async function clearBpCalibration(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

export function calibrationAgeDays(cal: BpCalibration): number {
  return Math.floor((Date.now() - new Date(cal.at).getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * One-point calibrated blood pressure estimate.
 *
 * A single real cuff reading anchors the intercept exactly; deviations from it use a
 * population-typical sensitivity of BP to pulse-wave upstroke time and heart rate, since
 * a single calibration point cannot fit a subject-specific slope. This is a meaningfully
 * different (and more honest) claim than the uncalibrated formula this feature replaced:
 * at the moment of calibration the value is exactly correct, and it degrades in a known,
 * bounded, and disclosed way afterward -- rather than being wrong from the start.
 *
 * Deviations are capped to a physiologically plausible range and confidence is flagged
 * as stale after 30 days; the estimate is refused entirely past 60 days uncalibrated.
 */
export function estimateCalibratedBp(
  cal: BpCalibration,
  upstrokeMs: number,
  bpm: number
): { systolic: number; diastolic: number; ageDays: number; stale: boolean } | null {
  const ageDays = calibrationAgeDays(cal);
  if (ageDays > MAX_CALIBRATION_AGE_DAYS) return null;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const upstrokeDelta = cal.upstrokeMs - upstrokeMs; // positive => vessels stiffer/faster wave than at calibration
  const bpmDelta = bpm - cal.bpm;

  const sysDelta = clamp(upstrokeDelta * 0.5 + bpmDelta * 0.15, -20, 20);
  const diaDelta = clamp(upstrokeDelta * 0.25 + bpmDelta * 0.08, -15, 15);

  const systolic = Math.round(cal.systolic + sysDelta);
  let diastolic = Math.round(cal.diastolic + diaDelta);
  if (diastolic > systolic - 15) diastolic = systolic - 15; // keep a physiologically plausible pulse pressure

  return { systolic, diastolic, ageDays, stale: ageDays > STALE_WARNING_DAYS };
}

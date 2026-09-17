import jpeg from 'jpeg-js';
import { base64ToBytes } from './base64';

interface ColorInfo {
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  l: number;
}

type RegionBounds = readonly [xMin: number, xMax: number, yMin: number, yMax: number];

/**
 * One centralized, deterministic face map. Coordinates are fractions of the
 * captured image and are applied identically on every run. Bilateral regions
 * contain two rectangles whose measured colors are averaged.
 */
const FACE_ZONES = {
  forehead: {
    label: 'Forehead (Heart)',
    association: 'Heart / Small Intestine',
    bounds: [[0.3, 0.7, 0.1, 0.3]],
  },
  temples: {
    label: 'Temples',
    association: 'Gallbladder; some maps associate this area with Liver',
    bounds: [[0.12, 0.28, 0.18, 0.38], [0.72, 0.88, 0.18, 0.38]],
  },
  betweenBrows: {
    label: 'Between eyebrows',
    association: 'Liver; some maps associate this area with Lung',
    bounds: [[0.43, 0.57, 0.27, 0.4]],
  },
  underEyes: {
    label: 'Under-eyes',
    association: 'Kidneys',
    bounds: [[0.24, 0.44, 0.36, 0.49], [0.56, 0.76, 0.36, 0.49]],
  },
  noseBridge: {
    label: 'Nose bridge',
    association: 'Liver',
    bounds: [[0.44, 0.56, 0.34, 0.5]],
  },
  noseTip: {
    label: 'Nose tip',
    association: 'Spleen',
    bounds: [[0.42, 0.58, 0.49, 0.62]],
  },
  noseSides: {
    label: 'Nose sides / nasal grooves',
    association: 'Stomach, Lung / Large Intestine',
    bounds: [[0.35, 0.65, 0.48, 0.64]],
  },
  upperCheeks: {
    label: 'Upper cheeks',
    association: 'Stomach',
    bounds: [[0.2, 0.4, 0.4, 0.54], [0.6, 0.8, 0.4, 0.54]],
  },
  lowerCheeks: {
    label: 'Middle and lower cheeks',
    association: 'Lungs',
    bounds: [[0.18, 0.4, 0.52, 0.68], [0.6, 0.82, 0.52, 0.68]],
  },
  mouth: {
    label: 'Lips and mouth',
    association: 'Spleen; upper lip–Stomach and lower lip–Small Intestine in some maps',
    bounds: [[0.35, 0.65, 0.62, 0.76]],
  },
  chin: {
    label: 'Chin (Kidneys)',
    association: 'Kidneys / Bladder',
    bounds: [[0.35, 0.65, 0.74, 0.92]],
  },
  overall: {
    label: 'Overall face',
    association: 'Overall complexion',
    bounds: [[0.2, 0.8, 0.1, 0.9]],
  },
} as const satisfies Record<string, {
  label: string;
  association: string;
  bounds: readonly RegionBounds[];
}>;

type ZoneKey = keyof typeof FACE_ZONES;

export interface FaceZoneObservation {
  key: string;
  label: string;
  association: string;
  observation: string;
  r: number;
  g: number;
  b: number;
  lightnessPercent: number;
}

export interface FaceDiagnosisResult {
  title: string;
  language: string;
  generatedAt: string;
  overall: {
    description: string;
    r: number;
    g: number;
    b: number;
    lightnessPercent: number;
    suitability: string;
  };
  zones: FaceZoneObservation[];
  patternFlags: string[];
}

/** Named thresholds used consistently by the report. No result is randomized. */
const COLOR_THRESHOLDS = Object.freeze({
  redToGreenRatio: 1.3,
  relativeDarkness: 0.8,
  relativeBrightness: 1.2,
  sallowGreenToBlueRatio: 1.4,
  sallowMaxRedToGreenRatio: 1.2,
  paleLightness: 0.75,
  paleMaxRedToGreenRatio: 1.1,
  lowSaturation: 0.12,
  minimumUsableLightness: 0.18,
  maximumUsableLightness: 0.92,
  samplingStepPixels: 4,
});

const IMAGE_PROCESSING = Object.freeze({
  maximumResolutionMegapixels: 4,
  rgbaChannelsPerPixel: 4,
});

const FALLBACK_MESSAGE = 'Could not analyze face. Please ensure your face is well-lit and centered.';

/**
 * Produces a deterministic educational TCM face-observation report on-device.
 * Only regional color and lightness are measured. The traditional associations
 * are not presented as evidence of organ health or as medical diagnoses.
 *
 * Returns the structured report, or null if the frame could not be analyzed --
 * check errorMessage() / use analyzeFaceOnDevice() for the human-readable form.
 */
export function analyzeFaceStructured(base64: string, language: string): FaceDiagnosisResult | null {
  try {
    const bytes = base64ToBytes(base64);
    if (bytes.length < 4) throw new Error('Invalid image data');

    const { data, width, height } = jpeg.decode(bytes, {
      useTArray: true,
      maxResolutionInMP: IMAGE_PROCESSING.maximumResolutionMegapixels,
    });
    if (width === 0 || height === 0) throw new Error('Invalid image dimensions');

    const regions = sampleAllZones(data, width, height);
    const overall = regions.overall;
    const reportZoneKeys = (Object.keys(FACE_ZONES) as ZoneKey[]).filter((key) => key !== 'overall');
    const zones: FaceZoneObservation[] = reportZoneKeys.map((key) => {
      const definition = FACE_ZONES[key];
      const color = regions[key];
      return {
        key,
        label: definition.label,
        association: definition.association,
        observation: describeColor(color, overall),
        r: round(color.r),
        g: round(color.g),
        b: round(color.b),
        lightnessPercent: Math.round(color.l * 100),
      };
    });

    const title = language === 'hi'
      ? 'TCM चेहरा अवलोकन रिपोर्ट'
      : language === 'te'
        ? 'TCM ముఖ పరిశీలన నివేదిక'
        : 'TCM FACE OBSERVATION REPORT';

    return {
      title,
      language,
      generatedAt: new Date().toISOString(),
      overall: {
        description: describeOverall(overall),
        r: round(overall.r),
        g: round(overall.g),
        b: round(overall.b),
        lightnessPercent: Math.round(overall.l * 100),
        suitability: imageSuitability(overall),
      },
      zones,
      patternFlags: createPatternFlags(regions),
    };
  } catch (err) {
    console.error('Face analysis error:', err);
    return null;
  }
}

/** Renders a structured report as the plain-text form used by chat/log contexts. */
export function formatFaceDiagnosisText(report: FaceDiagnosisResult): string {
  const zoneLines = report.zones.map((zone, index) =>
    `${index + 1}. ${zone.label}\n` +
    `   Traditional association: ${zone.association}\n` +
    `   Camera observation: ${zone.observation} ` +
    `(RGB ${zone.r}/${zone.g}/${zone.b}, lightness ${zone.lightnessPercent}%).`
  );
  const flags = report.patternFlags.length
    ? report.patternFlags.map((flag) => `• ${flag}`).join('\n')
    : '• No configured TCM color threshold was strongly triggered.';

  return [
    report.title,
    '',
    'METHOD',
    'A centered camera image was sampled across fixed facial zones. Regional RGB color and HSL lightness were compared with the same image’s overall facial sample.',
    '',
    'CAPTURE SUMMARY',
    `Overall complexion: ${report.overall.description}.`,
    `Overall sample: RGB ${report.overall.r}/${report.overall.g}/${report.overall.b}, lightness ${report.overall.lightnessPercent}%.`,
    `Image suitability: ${report.overall.suitability}.`,
    '',
    'TRADITIONAL ZONE REVIEW',
    ...zoneLines,
    '',
    'TRADITIONAL PATTERN FLAGS',
    flags,
    '',
    'NOT ASSESSED BY THIS CAMERA TEST',
    'Acne type, puffiness, hydration, skin texture, broken capillaries, wrinkles, eye vitality, hair condition, pulse, tongue, symptoms, and medical history are not measured. A mean-color calculation cannot reliably determine them.',
    '',
    'IMPORTANT LIMITATION',
    'This is an educational interpretation of traditional Chinese face-mapping concepts, not a medical diagnosis. Face mapping is not scientifically established for diagnosing internal-organ disease. Lighting, camera white balance, makeup, facial hair, and natural skin tone can change the result. For persistent skin changes or health concerns, consult a dermatologist or qualified medical professional.',
  ].join('\n');
}

/** @deprecated Prefer analyzeFaceStructured() + formatFaceDiagnosisText() for new callers. */
export function analyzeFaceOnDevice(base64: string, language: string): string {
  const report = analyzeFaceStructured(base64, language);
  return report ? formatFaceDiagnosisText(report) : FALLBACK_MESSAGE;
}

function sampleAllZones(data: Uint8Array, width: number, height: number): Record<ZoneKey, ColorInfo> {
  return (Object.keys(FACE_ZONES) as ZoneKey[]).reduce((result, key) => {
    const samples = FACE_ZONES[key].bounds.map(([xMin, xMax, yMin, yMax]) =>
      getRegionColor(data, width, height, xMin, xMax, yMin, yMax)
    );
    result[key] = averageColors(...samples);
    return result;
  }, {} as Record<ZoneKey, ColorInfo>);
}

function createPatternFlags(regions: Record<ZoneKey, ColorInfo>): string[] {
  const flags: string[] = [];
  const {
    redToGreenRatio,
    relativeDarkness,
    sallowGreenToBlueRatio,
    sallowMaxRedToGreenRatio,
    paleLightness,
    paleMaxRedToGreenRatio,
  } = COLOR_THRESHOLDS;

  if (regions.forehead.r > regions.forehead.g * redToGreenRatio) {
    flags.push('Heart Fire: warm/red forehead threshold was met.');
  }
  if (regions.noseTip.r > regions.noseTip.g * redToGreenRatio) {
    flags.push('Stomach Heat: warm/red nose-tip threshold was met.');
  }
  if (regions.lowerCheeks.r > regions.lowerCheeks.g * redToGreenRatio) {
    flags.push('Liver Fire / Lung Heat: warm/red cheek threshold was met.');
  }
  if (regions.underEyes.l < regions.overall.l * relativeDarkness) {
    flags.push('Kidney depletion: under-eye lightness was notably below the overall face.');
  }
  if (regions.chin.l < regions.overall.l * relativeDarkness) {
    flags.push('Kidney Deficiency: chin lightness was notably below the overall face.');
  }
  if (
    regions.overall.g > regions.overall.b * sallowGreenToBlueRatio &&
    regions.overall.r < regions.overall.g * sallowMaxRedToGreenRatio
  ) {
    flags.push('Spleen Qi Deficiency: the sallow/yellow color threshold was met.');
  } else if (regions.overall.l > paleLightness && regions.overall.r < regions.overall.g * paleMaxRedToGreenRatio) {
    flags.push('Blood Deficiency: the pale/bright color threshold was met.');
  }
  return flags;
}

function describeColor(zone: ColorInfo, overall: ColorInfo): string {
  const { relativeDarkness, relativeBrightness, redToGreenRatio, sallowGreenToBlueRatio, sallowMaxRedToGreenRatio, lowSaturation } = COLOR_THRESHOLDS;
  if (zone.l < overall.l * relativeDarkness) return 'markedly darker or duller than the overall facial sample';
  if (zone.l > overall.l * relativeBrightness) return 'markedly brighter than the overall facial sample';
  if (zone.r > zone.g * redToGreenRatio) return 'a pronounced warm/red color balance';
  if (zone.g > zone.b * sallowGreenToBlueRatio && zone.r < zone.g * sallowMaxRedToGreenRatio) return 'a yellow-green or sallow color balance';
  if (zone.s < lowSaturation) return 'low color saturation';
  return 'no strong configured color deviation';
}

function describeOverall(color: ColorInfo): string {
  const {
    sallowGreenToBlueRatio,
    sallowMaxRedToGreenRatio,
    paleLightness,
    paleMaxRedToGreenRatio,
    redToGreenRatio,
    lowSaturation,
  } = COLOR_THRESHOLDS;
  if (color.g > color.b * sallowGreenToBlueRatio && color.r < color.g * sallowMaxRedToGreenRatio) return 'yellow-green/sallow color balance';
  if (color.l > paleLightness && color.r < color.g * paleMaxRedToGreenRatio) return 'bright or pale color balance';
  if (color.r > color.g * redToGreenRatio) return 'warm/red color balance';
  if (color.s < lowSaturation) return 'low-saturation color balance';
  return 'no strong configured color deviation';
}

function imageSuitability(color: ColorInfo): string {
  if (color.l < COLOR_THRESHOLDS.minimumUsableLightness) return 'too dark for a reliable color comparison; retake in soft frontal light';
  if (color.l > COLOR_THRESHOLDS.maximumUsableLightness) return 'possibly overexposed; retake away from direct glare';
  return 'brightness is within the algorithm’s usable range, though color accuracy still depends on lighting';
}

function averageColors(...colors: ColorInfo[]): ColorInfo {
  const count = colors.length;
  const r = colors.reduce((sum, color) => sum + color.r, 0) / count;
  const g = colors.reduce((sum, color) => sum + color.g, 0) / count;
  const b = colors.reduce((sum, color) => sum + color.b, 0) / count;
  return { r, g, b, ...rgbToHsl(r, g, b) };
}

function getRegionColor(data: Uint8Array, width: number, height: number, xMin: number, xMax: number, yMin: number, yMax: number): ColorInfo {
  const startX = Math.floor(width * xMin);
  const endX = Math.floor(width * xMax);
  const startY = Math.floor(height * yMin);
  const endY = Math.floor(height * yMax);
  let r = 0, g = 0, b = 0, count = 0;
  const rgbaStride = IMAGE_PROCESSING.rgbaChannelsPerPixel;

  for (let y = startY; y < endY; y += COLOR_THRESHOLDS.samplingStepPixels) {
    for (let x = startX; x < endX; x += COLOR_THRESHOLDS.samplingStepPixels) {
      const index = (y * width + x) * rgbaStride;
      r += data[index]!;
      g += data[index + 1]!;
      b += data[index + 2]!;
      count++;
    }
  }

  if (count === 0) return { r: 0, g: 0, b: 0, h: 0, s: 0, l: 0 };
  r /= count;
  g /= count;
  b /= count;
  return { r, g, b, ...rgbToHsl(r, g, b) };
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r: h = (g - b) / delta + (g < b ? 6 : 0); break;
      case g: h = (b - r) / delta + 2; break;
      case b: h = (r - g) / delta + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function round(value: number): number {
  return Math.round(value);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

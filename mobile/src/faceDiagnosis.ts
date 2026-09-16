import jpeg from 'jpeg-js';
import { base64ToBytes } from './base64';

/**
 * Heuristic-based Traditional Chinese Medicine (TCM) face diagnosis running purely on-device.
 * Since we don't use external ML models for facial landmarks, this relies on spatial heuristics
 * assuming the user's face is centered in the camera frame.
 * 
 * TCM Face Mapping (simplified):
 * - Forehead: Heart / Small Intestine
 * - Nose: Spleen / Stomach
 * - Cheeks: Lungs / Liver
 * - Chin: Kidneys
 */

interface ColorInfo {
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  l: number;
}

export function analyzeFaceOnDevice(base64: string, language: string): string {
  try {
    const bytes = base64ToBytes(base64);
    if (bytes.length < 4) throw new Error('Invalid image data');

    // Decode JPEG
    const { data, width, height } = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 4 });
    if (width === 0 || height === 0) throw new Error('Invalid image dimensions');

    // Spatial heuristics for a centered face portrait
    const regions = {
      forehead: getRegionColor(data, width, height, 0.3, 0.7, 0.1, 0.3),
      leftCheek: getRegionColor(data, width, height, 0.2, 0.4, 0.4, 0.6),
      rightCheek: getRegionColor(data, width, height, 0.6, 0.8, 0.4, 0.6),
      nose: getRegionColor(data, width, height, 0.45, 0.55, 0.45, 0.6),
      chin: getRegionColor(data, width, height, 0.4, 0.6, 0.75, 0.9),
      overall: getRegionColor(data, width, height, 0.2, 0.8, 0.1, 0.9),
    };

    let diagnosis = [];

    // Analyze Forehead (Heart/Small Intestine)
    if (regions.forehead.r > regions.forehead.g * 1.3) {
      diagnosis.push("- Forehead (Heart): Elevated redness suggests 'Heart Fire' or excess heat, possibly related to stress, poor sleep, or dehydration.");
    } else {
      diagnosis.push("- Forehead (Heart): Color appears balanced, indicating calm heart energy and good rest.");
    }

    // Analyze Nose (Spleen/Stomach)
    if (regions.nose.r > regions.nose.g * 1.3) {
      diagnosis.push("- Nose (Spleen/Stomach): Redness indicates 'Stomach Heat', which might correlate with digestive irritation or spicy food intake.");
    } else if (regions.nose.l < 0.4) {
      diagnosis.push("- Nose (Spleen/Stomach): Darker tone suggests poor digestion or coldness in the stomach.");
    } else {
      diagnosis.push("- Nose (Spleen/Stomach): Normal tone indicates balanced digestion.");
    }

    // Analyze Cheeks (Liver/Lungs)
    const avgCheek = {
      r: (regions.leftCheek.r + regions.rightCheek.r) / 2,
      g: (regions.leftCheek.g + regions.rightCheek.g) / 2,
      b: (regions.leftCheek.b + regions.rightCheek.b) / 2,
    };
    if (avgCheek.r > avgCheek.g * 1.25) {
      diagnosis.push("- Cheeks (Liver/Lungs): Flushed cheeks can indicate 'Liver Fire' (frustration, anger) or Lung heat (allergies, respiratory stress).");
    } else if (avgCheek.r < avgCheek.g * 1.1) {
      diagnosis.push("- Cheeks (Liver/Lungs): Pale tone might suggest Lung Qi deficiency or fatigue.");
    } else {
      diagnosis.push("- Cheeks (Liver/Lungs): Good color indicates healthy respiratory and liver function.");
    }

    // Analyze Chin (Kidneys/Hormones)
    if (regions.chin.l < regions.overall.l * 0.8) {
      diagnosis.push("- Chin (Kidneys): Darker or duller tone suggests 'Kidney Deficiency', often related to hormonal imbalance, exhaustion, or fear.");
    } else if (regions.chin.r > regions.chin.g * 1.3) {
      diagnosis.push("- Chin (Kidneys): Redness can indicate hormonal breakouts or lower body heat.");
    } else {
      diagnosis.push("- Chin (Kidneys): Normal tone indicates good kidney essence and hormonal balance.");
    }

    // Overall Skin Tone
    if (regions.overall.g > regions.overall.b * 1.4 && regions.overall.r < regions.overall.g * 1.2) {
      diagnosis.push("- Overall Tone: Sallow or yellowish tone suggests Spleen Qi deficiency (digestive fatigue).");
    } else if (regions.overall.l > 0.75 && regions.overall.r < regions.overall.g * 1.1) {
      diagnosis.push("- Overall Tone: Very pale tone suggests Blood Deficiency (anemia, poor circulation).");
    }

    const header = language === 'en' 
      ? "On-Device TCM Face Analysis Results:\n\n" 
      : "ఆన్-డివైస్ TCM ఫేస్ విశ్లేషణ ఫలితాలు:\n\n";

    return header + diagnosis.join('\n');
  } catch (err) {
    console.error('Face analysis error:', err);
    return 'Could not analyze face. Please ensure your face is well-lit and centered.';
  }
}

// Extracts average RGB and HSL from a specific bounding box (percentages 0-1)
function getRegionColor(data: Uint8Array, width: number, height: number, xMin: number, xMax: number, yMin: number, yMax: number): ColorInfo {
  const startX = Math.floor(width * xMin);
  const endX = Math.floor(width * xMax);
  const startY = Math.floor(height * yMin);
  const endY = Math.floor(height * yMax);

  let r = 0, g = 0, b = 0, count = 0;
  
  const stride = 4;
  for (let y = startY; y < endY; y += 4) { // subsample for speed
    for (let x = startX; x < endX; x += 4) {
      const idx = (y * width + x) * stride;
      r += data[idx]!;
      g += data[idx + 1]!;
      b += data[idx + 2]!;
      count++;
    }
  }

  if (count === 0) return { r: 0, g: 0, b: 0, h: 0, s: 0, l: 0 };

  r = r / count;
  g = g / count;
  b = b / count;

  return { r, g, b, ...rgbToHsl(r, g, b) };
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

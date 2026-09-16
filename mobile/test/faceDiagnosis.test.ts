import { describe, it, expect } from 'vitest';
import jpeg from 'jpeg-js';
import { base64ToBytes } from '../src/base64';
import { analyzeFaceOnDevice } from '../src/faceDiagnosis';

/** Encodes a flat-coloured RGBA image as a JPEG, the way the camera hands us one. */
function jpegBase64(r: number, g: number, b: number, quality: number, w = 96, h = 128): string {
  const raw = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    raw[i * 4] = r; raw[i * 4 + 1] = g; raw[i * 4 + 2] = b; raw[i * 4 + 3] = 255;
  }
  const { data } = jpeg.encode({ data: raw as any, width: w, height: h }, quality);
  return Buffer.from(data).toString('base64');
}

describe('base64ToBytes', () => {
  // A JPEG ends in the EOI marker FF D9. Dropping the tail bytes strips it and
  // jpeg-js then dies with "marker was not found".
  it('round-trips byte-exactly whatever padding the string carries', () => {
    for (const len of [1, 2, 3, 4, 5, 6, 7, 8, 100, 101, 102]) {
      const src = Buffer.from(Array.from({ length: len }, (_, i) => (i * 37) % 256));
      const b64 = src.toString('base64');
      expect(Buffer.from(base64ToBytes(b64)), `length ${len} (ends "${b64.slice(-2)}")`).toEqual(src);
    }
  });

  it('preserves the trailing EOI marker of a real JPEG', () => {
    for (const quality of [30, 50, 80, 95]) {
      const bytes = base64ToBytes(jpegBase64(200, 150, 140, quality));
      expect([bytes[bytes.length - 2], bytes[bytes.length - 1]], `quality ${quality}`).toEqual([0xff, 0xd9]);
    }
  });
});

describe('analyzeFaceOnDevice', () => {
  it('decodes a captured frame instead of falling back to the error string', () => {
    for (const quality of [30, 50, 80, 95]) {
      const out = analyzeFaceOnDevice(jpegBase64(200, 150, 140, quality), 'en');
      expect(out, `quality ${quality}`).not.toMatch(/Could not analyze face/);
      expect(out).toContain('Forehead (Heart)');
      expect(out).toContain('Chin (Kidneys)');
    }
  });

  it('reports a flushed face differently from a pale one', () => {
    const flushed = analyzeFaceOnDevice(jpegBase64(220, 120, 110, 80), 'en');
    const pale = analyzeFaceOnDevice(jpegBase64(210, 205, 200, 80), 'en');
    expect(flushed).not.toEqual(pale);
    expect(flushed).toMatch(/Heart Fire|Liver Fire|Stomach Heat/);
  });

  it('returns a complete structured report for every configured facial zone', () => {
    const report = analyzeFaceOnDevice(jpegBase64(190, 150, 130, 80), 'en');
    expect(report).toContain('TCM FACE OBSERVATION REPORT');
    expect(report).toContain('CAPTURE SUMMARY');
    expect(report).toContain('TRADITIONAL ZONE REVIEW');
    expect(report).toContain('TRADITIONAL PATTERN FLAGS');
    expect(report).toContain('IMPORTANT LIMITATION');

    for (const zone of [
      'Forehead (Heart)', 'Temples', 'Between eyebrows', 'Under-eyes',
      'Nose bridge', 'Nose tip', 'Nose sides / nasal grooves', 'Upper cheeks',
      'Middle and lower cheeks', 'Lips and mouth', 'Chin (Kidneys)',
    ]) {
      expect(report, zone).toContain(zone);
    }
  });

  it('is deterministic for the same captured image', () => {
    const image = jpegBase64(180, 145, 125, 80);
    expect(analyzeFaceOnDevice(image, 'en')).toBe(analyzeFaceOnDevice(image, 'en'));
  });

  it('still returns the friendly fallback for genuinely unusable data', () => {
    expect(analyzeFaceOnDevice('', 'en')).toMatch(/Could not analyze face/);
    expect(analyzeFaceOnDevice('bm90IGEgamZwZWc=', 'en')).toMatch(/Could not analyze face/);
  });
});

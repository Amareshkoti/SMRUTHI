import { MAX_INLINE_BASE64_BYTES } from '../nim/parse.js';

/**
 * nemotron-parse takes the image inline as base64, and large scans blow past
 * the payload ceiling (a full-page PNG at 150 dpi is ~200 KB base64 and the
 * request simply hangs). Phone cameras produce much bigger files than that, so
 * every page is downscaled to JPEG before it is sent.
 */
export interface PreparedImage {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
}

const TARGET_WIDTHS = [1000, 800, 640];

export async function prepareForParse(input: Buffer): Promise<PreparedImage> {
  // Loaded lazily so the server still boots if the optional native dep is absent.
  const { default: sharp } = await import('sharp');
  const meta = await sharp(input).metadata();

  for (const width of TARGET_WIDTHS) {
    for (const quality of [82, 70, 58]) {
      const out = await sharp(input)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      const base64 = out.toString('base64');
      if (base64.length <= MAX_INLINE_BASE64_BYTES) {
        return {
          base64,
          mimeType: 'image/jpeg',
          width: Math.min(width, meta.width ?? width),
          height: meta.height ?? 0,
        };
      }
    }
  }
  throw new Error('Could not compress page under the inline size limit');
}

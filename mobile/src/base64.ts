/**
 * A minimal base64 decoder. React Native's JS engine (Hermes) has no global
 * `Buffer` or reliable `atob` on native, so anything that needs raw bytes from
 * a base64 string (e.g. decoding a captured camera frame) goes through this.
 */
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < CHARS.length; i++) LOOKUP[CHARS.charCodeAt(i)] = i;

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');

  // `clean` has the padding stripped, so the byte count comes from its length
  // alone: every 4 chars carry 3 bytes, a 3-char tail carries 2 and a 2-char
  // tail carries 1. Deriving it from the padding instead used to under-count by
  // up to 2, which chopped the EOI marker off a JPEG and made jpeg-js throw.
  const fullGroups = Math.floor(clean.length / 4);
  const remainder = clean.length - fullGroups * 4;
  const bytes = new Uint8Array(fullGroups * 3 + (remainder > 1 ? remainder - 1 : 0));

  let p = 0;
  let i = 0;
  for (; i + 4 <= clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)]!;
    const b = LOOKUP[clean.charCodeAt(i + 1)]!;
    const cc = LOOKUP[clean.charCodeAt(i + 2)]!;
    const d = LOOKUP[clean.charCodeAt(i + 3)]!;
    bytes[p++] = (a << 2) | (b >> 4);
    bytes[p++] = ((b & 15) << 4) | (cc >> 2);
    bytes[p++] = ((cc & 63) << 6) | d;
  }

  // Trailing partial group: 2 chars encode 1 more byte, 3 chars encode 2.
  if (remainder >= 2) {
    const a = LOOKUP[clean.charCodeAt(i)]!;
    const b = LOOKUP[clean.charCodeAt(i + 1)]!;
    bytes[p++] = (a << 2) | (b >> 4);
    if (remainder === 3) {
      const cc = LOOKUP[clean.charCodeAt(i + 2)]!;
      bytes[p++] = ((b & 15) << 4) | (cc >> 2);
    }
  }

  return bytes;
}

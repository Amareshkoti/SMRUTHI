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
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const byteLength = Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
  const bytes = new Uint8Array(byteLength);
  let p = 0;
  for (let i = 0; i + 4 <= clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)]!;
    const b = LOOKUP[clean.charCodeAt(i + 1)]!;
    const cc = LOOKUP[clean.charCodeAt(i + 2)]!;
    const d = LOOKUP[clean.charCodeAt(i + 3)]!;
    if (p < byteLength) bytes[p++] = (a << 2) | (b >> 4);
    if (p < byteLength) bytes[p++] = ((b & 15) << 4) | (cc >> 2);
    if (p < byteLength) bytes[p++] = ((cc & 63) << 6) | d;
  }
  return bytes;
}

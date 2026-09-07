import { MAX_UPLOAD_BYTES } from '../../shared/contracts.js';
export class InputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function decodeUpload(base64: string, mimeType: string): Buffer {
  if (!base64.length || base64.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 ||
      base64.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new InputError('The upload is empty, too large, or not valid base64.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new InputError('The upload is too large.', 413);
  if (!bytes.length || bytes.toString('base64') !== base64) throw new InputError('The upload encoding is invalid.');
  const signature = bytes.subarray(0, 16);
  const match = mimeType === 'application/pdf' ? signature.toString('ascii').startsWith('%PDF-')
    : mimeType === 'image/png' ? signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mimeType === 'image/jpeg' ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255
    : mimeType === 'image/webp' ? signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP'
    : ['image/heic', 'image/heif'].includes(mimeType) && signature.toString('ascii', 4, 8) === 'ftyp';
  if (!match) throw new InputError('The file contents do not match the selected file type.');
  return bytes;
}

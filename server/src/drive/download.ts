import { config } from '../config.js';
import { resolveDriveLink, type DriveTarget } from './resolve.js';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  bytes: Buffer;
}

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Public single files download with no credentials at all. Listing a FOLDER
 * needs a Google API key -- the folder page is JavaScript-rendered, so there is
 * nothing to scrape. The key is a plain API key, not OAuth: no consent screen.
 */
export async function fetchFromDrive(link: string): Promise<DriveFile[]> {
  const target = resolveDriveLink(link);
  if (target.kind === 'file') return [await downloadFile(target.id)];

  if (!config.googleApiKey) {
    throw new Error(
      'That is a folder link. Folder listing needs GOOGLE_API_KEY in server/.env ' +
        '(console.cloud.google.com -> APIs & Services -> Credentials -> Create API key, ' +
        'then enable the Google Drive API). Single-file links work without it.',
    );
  }
  const ids = await listFolder(target.id);
  const out: DriveFile[] = [];
  for (const id of ids) out.push(await downloadFile(id));
  return out;
}

async function listFolder(folderId: string): Promise<string[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
    `&fields=files(id,name,mimeType)&pageSize=100&key=${config.googleApiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Could not list that folder (HTTP ${res.status}). Make sure it is shared as ` +
        '"Anyone with the link".',
    );
  }
  const json = (await res.json()) as { files?: { id: string; mimeType: string }[] };
  return (json.files ?? [])
    .filter((f) => f.mimeType.startsWith('image/') || f.mimeType === 'application/pdf')
    .map((f) => f.id);
}

async function downloadFile(id: string): Promise<DriveFile> {
  const meta = await fetchMeta(id);
  const url = config.googleApiKey
    ? `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${config.googleApiKey}`
    : `https://drive.usercontent.google.com/download?id=${id}&export=download`;

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(
      `Could not download that file (HTTP ${res.status}). Set its sharing to ` +
        '"Anyone with the link".',
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());

  // Without a key, Drive answers large files with an HTML interstitial instead
  // of the bytes. Detect that rather than feeding HTML to the parser.
  if (buf.subarray(0, 200).toString('utf8').trimStart().toLowerCase().startsWith('<!doctype html')) {
    throw new Error(
      'Google returned a confirmation page instead of the file. The file may be too ' +
        'large to download without a key, or it is not shared publicly.',
    );
  }
  if (buf.length > MAX_BYTES) throw new Error('That file is larger than 25 MB.');

  return {
    id,
    name: meta?.name ?? `drive-${id}`,
    mimeType: meta?.mimeType ?? sniff(buf),
    bytes: buf,
  };
}

async function fetchMeta(id: string): Promise<{ name: string; mimeType: string } | null> {
  if (!config.googleApiKey) return null;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType&key=${config.googleApiKey}`,
  );
  if (!res.ok) return null;
  return (await res.json()) as { name: string; mimeType: string };
}

function sniff(buf: Buffer): string {
  const h = buf.subarray(0, 4).toString('hex');
  if (h.startsWith('89504e47')) return 'image/png';
  if (h.startsWith('ffd8ff')) return 'image/jpeg';
  if (h.startsWith('25504446')) return 'application/pdf';
  return 'application/octet-stream';
}

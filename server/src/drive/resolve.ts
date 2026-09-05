/**
 * Google Drive share links come in several shapes. We accept all of them and
 * reduce to an id plus what kind of thing it points at.
 */
export type DriveTarget =
  | { kind: 'file'; id: string }
  | { kind: 'folder'; id: string };

const PATTERNS: { re: RegExp; kind: 'file' | 'folder' }[] = [
  { re: /\/file\/d\/([a-zA-Z0-9_-]{10,})/, kind: 'file' },
  { re: /\/document\/d\/([a-zA-Z0-9_-]{10,})/, kind: 'file' },
  { re: /\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]{10,})/, kind: 'folder' },
  { re: /[?&]id=([a-zA-Z0-9_-]{10,})/, kind: 'file' },
];

export function resolveDriveLink(input: string): DriveTarget {
  const url = input.trim();
  if (!url) throw new Error('Paste a Google Drive link first.');

  for (const { re, kind } of PATTERNS) {
    const m = url.match(re);
    if (m?.[1]) return { kind, id: m[1] };
  }

  // A bare id pasted on its own.
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url)) return { kind: 'file', id: url };

  throw new Error(
    'That does not look like a Google Drive link. Expected something like ' +
      'https://drive.google.com/file/d/FILE_ID/view',
  );
}

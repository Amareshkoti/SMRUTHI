import { describe, it, expect } from 'vitest';
import { resolveDriveLink } from '../src/drive/resolve.js';

describe('resolveDriveLink', () => {
  it.each([
    ['https://drive.google.com/file/d/1AbC_dEfG-hIjKlMnOpQ/view?usp=sharing', 'file', '1AbC_dEfG-hIjKlMnOpQ'],
    ['https://drive.google.com/file/d/1AbC_dEfG-hIjKlMnOpQ/view', 'file', '1AbC_dEfG-hIjKlMnOpQ'],
    ['https://drive.google.com/open?id=1AbC_dEfG-hIjKlMnOpQ', 'file', '1AbC_dEfG-hIjKlMnOpQ'],
    ['https://drive.google.com/uc?export=download&id=1AbC_dEfG-hIjKlMnOpQ', 'file', '1AbC_dEfG-hIjKlMnOpQ'],
    ['https://drive.google.com/drive/folders/1FoLdEr_IdHere12345', 'folder', '1FoLdEr_IdHere12345'],
    ['https://drive.google.com/drive/u/0/folders/1FoLdEr_IdHere12345', 'folder', '1FoLdEr_IdHere12345'],
  ])('parses %s', (url, kind, id) => {
    expect(resolveDriveLink(url)).toEqual({ kind, id });
  });

  it('accepts a bare file id', () => {
    expect(resolveDriveLink('1AbC_dEfG-hIjKlMnOpQrSt')).toEqual({ kind: 'file', id: '1AbC_dEfG-hIjKlMnOpQrSt' });
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(resolveDriveLink('  https://drive.google.com/file/d/1AbC_dEfG-hIjKlMnOpQ/view  ').id)
      .toBe('1AbC_dEfG-hIjKlMnOpQ');
  });

  it('rejects an empty string with a useful message', () => {
    expect(() => resolveDriveLink('   ')).toThrow(/Paste a Google Drive link/);
  });

  it('rejects a non-Drive url with a useful message', () => {
    expect(() => resolveDriveLink('https://example.com/report.pdf')).toThrow(/does not look like/);
  });
});

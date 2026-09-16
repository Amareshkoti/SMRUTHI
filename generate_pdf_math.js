/**
 * Renders the reflective-PPG document to PDF with real typeset mathematics.
 *
 * Formulas are written as LaTeX ($$...$$ display, $...$ inline) in the markdown and
 * rendered by KaTeX *server side*, so the PDF needs no network access and no CDN.
 * KaTeX's stylesheet refers to its fonts by relative URL, which breaks under a
 * file:// page, so the font URLs are rewritten to absolute paths before inlining.
 */
const fs = require('fs');
const path = require('path');
const katex = require('katex');
const { marked } = require('marked');
const puppeteer = require('puppeteer-core');

const SRC = process.argv[2] || 'Reflective_PPG_Formulas_and_Scientific_Validation.md';
const OUT = process.argv[3] || 'Reflective_PPG_Formulas_and_Scientific_Validation.pdf';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findBrowser() {
  const found = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Microsoft Edge not found in: ' + EDGE_CANDIDATES.join(', '));
  return found;
}

/** Pull math out before markdown runs, so marked cannot mangle backslashes or underscores. */
function extractMath(md) {
  const slots = [];
  const stash = (tex, display) => {
    slots.push({ tex, display });
    return `@@KTX${slots.length - 1}@@`;
  };
  // Display math first: $$ ... $$ (may span lines).
  let out = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(tex.trim(), true));
  // Then inline: $ ... $ on a single line, not touching an adjacent digit (avoids "$5").
  out = out.replace(/(?<![\\$])\$([^\$\n]+?)\$(?!\$)/g, (_, tex) => stash(tex.trim(), false));
  return { md: out, slots };
}

function renderMath(html, slots) {
  return html.replace(/@@KTX(\d+)@@/g, (_, i) => {
    const { tex, display } = slots[Number(i)];
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
      });
    } catch (err) {
      console.warn('KaTeX failed for:', tex.slice(0, 60), '-', err.message);
      return `<code>${tex}</code>`;
    }
  });
}

function katexCss() {
  const dist = path.dirname(require.resolve('katex/package.json')) + '/dist';
  const css = fs.readFileSync(path.join(dist, 'katex.min.css'), 'utf8');
  const fontsUrl = 'file:///' + path.join(dist, 'fonts').replace(/\\/g, '/');
  return css.replace(/url\((['"]?)fonts\//g, `url($1${fontsUrl}/`);
}

/*
 * The original document design, carried over verbatim from generate_pdf_v3.js.
 * Only the .katex rules below are new, and they are layout plumbing (keep a
 * formula off a page break) rather than restyling -- the look is unchanged.
 */
const PAGE_CSS = `
  body { font-family: Arial, sans-serif; line-height: 1.6; color: #222; }
  h1 { font-size: 24px; color: #111; border-bottom: 2px solid #ccc; padding-bottom: 8px; margin-bottom: 10px; }
  h2 { font-size: 18px; color: #444; margin-top: 5px; margin-bottom: 20px;}
  h3 { font-size: 18px; margin-top: 25px; margin-bottom: 15px; color: #000; }
  h4 { font-size: 14px; margin-top: 20px; margin-bottom: 8px; color: #005A9C; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 12px; }
  th, td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; vertical-align: top; }
  th { background-color: #f2f2f2; color: #111; font-weight: bold; }
  pre { background-color: #f8f9fa; padding: 10px; border-radius: 6px; border: 1px solid #e9ecef; overflow-x: auto; white-space: pre-wrap; font-family: Consolas, monospace; font-size: 12px; line-height: 1.4; color: #22425E; }
  code { font-family: Consolas, monospace; font-size: 12px; background-color: #f8f9fa; padding: 2px 4px; border-radius: 4px; }
  p { margin-bottom: 12px; font-size: 13px; }
  hr { border: 0; border-top: 1px solid #eee; margin: 25px 0; }
  blockquote { margin: 15px 0; padding: 8px 14px; border-left: 3px solid #ccc; color: #444; }
  blockquote p { margin: 4px 0; }
  /* Keep a display formula intact rather than splitting it across two pages. */
  .katex-display { margin: 14px 0; break-inside: avoid; page-break-inside: avoid; }
  h3, h4 { break-after: avoid; page-break-after: avoid; }
`;

(async () => {
  const raw = fs.readFileSync(SRC, 'utf8');
  const { md, slots } = extractMath(raw);
  const body = renderMath(marked.parse(md), slots);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>${katexCss()}</style><style>${PAGE_CSS}</style></head><body>${body}</body></html>`;

  const tmp = path.resolve('styled_math.html');
  fs.writeFileSync(tmp, html, 'utf8');

  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);

    const unrendered = await page.evaluate(() => document.body.innerHTML.match(/@@KTX\d+@@/g)?.length || 0);
    const formulas = await page.evaluate(() => document.querySelectorAll('.katex').length);

    await page.pdf({
      path: OUT,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size: 10px; text-align: center; width: 100%; color: #666;">' +
        'Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    });
    if (process.env.SHOT) {
      // Proof-read aid: rasterise the formula-heavy stretch so it can be eyeballed.
      await page.setViewport({ width: 900, height: 1250, deviceScaleFactor: 2 });
      await page.evaluate(() => {
        const h = [...document.querySelectorAll('h4')].find((x) => x.textContent.includes('2.4'));
        if (h) h.scrollIntoView();
      });
      await page.screenshot({ path: process.env.SHOT });
      console.log(`screenshot: ${process.env.SHOT}`);
    }
    console.log(`formulas typeset: ${formulas}`);
    console.log(`unrendered placeholders: ${unrendered}`);
    console.log(`written: ${OUT}`);
    if (unrendered > 0) process.exitCode = 1;
  } finally {
    await browser.close();
    fs.unlinkSync(tmp);
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});

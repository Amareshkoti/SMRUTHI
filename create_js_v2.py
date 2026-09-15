import io

js_code = r'''
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
let marked;
try {
  marked = require('marked').marked || require('marked');
} catch (e) {
  console.error("Marked not found.");
  process.exit(1);
}

(async () => {
  try {
    const mdContent = fs.readFileSync('Reflective_PPG_Formulas_and_Scientific_Validation.md', 'utf8');
    const htmlContent = marked.parse ? marked.parse(mdContent) : marked(mdContent);

    const css = 
      body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #222; }
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
    ;

    const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + htmlContent + '</body></html>';

    fs.writeFileSync('styled.html', fullHtml, 'utf8');

    const browser = await puppeteer.launch({
      executablePath: 'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
      headless: 'new'
    });
    const page = await browser.newPage();
    await page.goto('file:///' + path.resolve('styled.html').replace(/\\\\/g, '/'), { waitUntil: 'networkidle0' });
    
    await page.pdf({
      path: 'Reflective_PPG_Formulas_and_Scientific_Validation.pdf',
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size: 10px; text-align: center; width: 100%; color: #666;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
    });
    await browser.close();
    console.log("PDF generated successfully.");
  } catch (error) {
    console.error("Error generating PDF:", error);
  }
})();
'''
with io.open('generate_pdf_v2.js', 'w', encoding='utf-8') as f:
    f.write(js_code)

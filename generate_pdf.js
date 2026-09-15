
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

(async () => {
  const htmlContent = fs.readFileSync('styled_temp.html', 'utf8');
  const fullHtml = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<style>\n' +
    '@page { margin: 20mm; }\n' +
    'body { font-family: "Segoe UI", Arial, sans-serif; line-height: 1.6; color: #222; }\n' +
    'h1 { font-size: 24px; color: #111; border-bottom: 2px solid #ccc; padding-bottom: 8px; margin-bottom: 10px; }\n' +
    'h2 { font-size: 18px; color: #444; margin-top: 5px; margin-bottom: 20px;}\n' +
    'h3 { font-size: 18px; margin-top: 25px; margin-bottom: 15px; color: #000; }\n' +
    'h4 { font-size: 14px; margin-top: 20px; margin-bottom: 8px; color: #005A9C; }\n' +
    'table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 12px; }\n' +
    'th, td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; vertical-align: top; }\n' +
    'th { background-color: #f2f2f2; color: #111; font-weight: bold; }\n' +
    'pre { background-color: #f8f9fa; padding: 10px; border-radius: 6px; border: 1px solid #e9ecef; overflow-x: auto; white-space: pre-wrap; font-family: Consolas, monospace; font-size: 12px; line-height: 1.4; color: #22425E; }\n' +
    'code { font-family: Consolas, monospace; font-size: 12px; background-color: #f8f9fa; padding: 2px 4px; border-radius: 4px; }\n' +
    'p { margin-bottom: 12px; font-size: 13px; }\n' +
    'hr { border: 0; border-top: 1px solid #eee; margin: 25px 0; }\n' +
    '</style>\n</head>\n<body>\n' + htmlContent + '\n</body>\n</html>';
  
  fs.writeFileSync('styled.html', fullHtml);

  const browser = await puppeteer.launch({
    executablePath: 'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    headless: 'new'
  });
  const page = await browser.newPage();
  await page.goto('file:///' + path.resolve('styled.html').replace(/\\\\/g, '/'), { waitUntil: 'networkidle0' });
  await page.pdf({
    path: 'Reflective_PPG_Formulas_and_Scientific_Validation.pdf',
    format: 'A4',
    printBackground: true
  });
  await browser.close();
})();

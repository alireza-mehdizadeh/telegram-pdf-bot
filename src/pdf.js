import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import puppeteer from 'puppeteer';

// The PDF is rendered by headless Chromium, because it handles Persian letter
// shaping and right-to-left / mixed-direction text correctly.

const require = createRequire(import.meta.url);
const fontDir = path.join(
  path.dirname(require.resolve('vazirmatn/package.json')),
  'fonts',
  'webfonts',
);

let fontCssPromise;
function fontCss() {
  fontCssPromise ??= Promise.all(
    [
      ['Regular', 400],
      ['Bold', 700],
    ].map(async ([name, weight]) => {
      const data = await readFile(path.join(fontDir, `Vazirmatn-${name}.woff2`));
      return `@font-face {
        font-family: "Vazirmatn";
        font-weight: ${weight};
        src: url(data:font/woff2;base64,${data.toString('base64')}) format("woff2");
      }`;
    }),
  ).then((rules) => rules.join('\n'));
  return fontCssPromise;
}

let browserPromise;
function getBrowser() {
  browserPromise ??= puppeteer
    .launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    .then((browser) => {
      browser.on('disconnected', () => {
        browserPromise = undefined;
      });
      return browser;
    })
    .catch((err) => {
      browserPromise = undefined;
      throw err;
    });
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  await browser?.close();
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// dir="auto" on every line lets each one pick its own direction:
// Persian lines go right-to-left, English lines left-to-right.
function textHtml(text) {
  return text
    .split('\n')
    .map((line) => (line.trim() ? `<p dir="auto">${escapeHtml(line)}</p>` : '<p class="gap"></p>'))
    .join('');
}

function itemHtml(item) {
  if (item.type === 'image') {
    const src = `data:${item.mime};base64,${item.data.toString('base64')}`;
    const caption = item.caption ? `<figcaption>${textHtml(item.caption)}</figcaption>` : '';
    return `<figure><img src="${src}">${caption}</figure>`;
  }
  return `<section class="text">${textHtml(item.text)}</section>`;
}

/**
 * @param {Array<{type: 'text', text: string} | {type: 'image', data: Buffer, mime: string, caption?: string}>} items
 * @returns {Promise<Buffer>}
 */
export async function buildPdf(items) {
  const html = `<!doctype html>
<html lang="fa">
<head>
<meta charset="utf-8">
<style>
  ${await fontCss()}
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Vazirmatn", "Noto Color Emoji", "Apple Color Emoji", sans-serif;
    font-size: 13pt;
    line-height: 1.9;
    color: #1a1a1a;
  }
  p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; unicode-bidi: plaintext; text-align: start; }
  p.gap { height: 0.9em; }
  .text, figure { margin: 0 0 18pt; }
  figure { break-inside: avoid; text-align: center; }
  figure img { max-width: 100%; max-height: 200mm; border-radius: 4pt; }
  figcaption { margin-top: 8pt; text-align: start; }
</style>
</head>
<body>${items.map(itemHtml).join('\n')}</body>
</html>`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 120_000 });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
      timeout: 120_000,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

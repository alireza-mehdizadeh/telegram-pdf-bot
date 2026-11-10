import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { buildHtml, fontFaceCss, PDF_OPTIONS } from './html.js';

// Local (Node) PDF renderer. The PDF is rendered by headless Chromium, because
// it handles Persian letter shaping and right-to-left / mixed-direction text correctly.

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
      return { weight, base64: data.toString('base64') };
    }),
  ).then(fontFaceCss);
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

/**
 * @param {Array<{type: 'text', text: string} | {type: 'image', data: Buffer, mime: string, caption?: string}>} items
 * @returns {Promise<Buffer>}
 */
export async function buildPdf(items) {
  const html = buildHtml(
    items.map((item) =>
      item.type === 'image'
        ? { ...item, src: `data:${item.mime};base64,${item.data.toString('base64')}` }
        : item,
    ),
    await fontCss(),
  );

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 120_000 });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.pdf(PDF_OPTIONS));
  } finally {
    await page.close();
  }
}

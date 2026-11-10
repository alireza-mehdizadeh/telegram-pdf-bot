import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { buildHtml, fontFaceCss, pdfOptions } from './html.js';

// Local preview renderer (used by test/make-sample.js): prints the same HTML
// the Worker produces, with a locally installed headless Chrome.

const require = createRequire(import.meta.url);
const fontDir = path.join(
  path.dirname(require.resolve('vazirmatn/package.json')),
  'fonts',
  'webfonts',
);

async function fontCss() {
  const fonts = await Promise.all(
    [
      ['Regular', 400],
      ['Bold', 700],
    ].map(async ([name, weight]) => {
      const data = await readFile(path.join(fontDir, `Vazirmatn-${name}.woff2`));
      return { weight, base64: data.toString('base64') };
    }),
  );
  return fontFaceCss(fonts);
}

/**
 * @param {Array<object>} items like buildHtml(), except images carry `data` (Buffer) and `mime`
 * @param {{settings?: object, title?: string}} [options]
 * @returns {Promise<Buffer>}
 */
export async function buildPdf(items, options = {}) {
  const html = buildHtml(
    items.map((item) =>
      item.type === 'image'
        ? { ...item, src: `data:${item.mime};base64,${item.data.toString('base64')}` }
        : item,
    ),
    await fontCss(),
    options,
  );

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 120_000 });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.pdf(pdfOptions(options.settings)));
  } finally {
    await browser.close();
  }
}

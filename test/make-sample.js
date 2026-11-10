// Builds test/sample.pdf without Telegram, to check Persian rendering and image layout.
import { writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { buildPdf, closeBrowser } from '../src/pdf.js';

// Make a sample image with the same headless browser.
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 450 });
await page.setContent(
  '<body style="margin:0;height:100vh;background:linear-gradient(135deg,#2b6cb0,#9f7aea);display:grid;place-items:center;font:60px sans-serif;color:#fff">Sample image</body>',
);
const image = Buffer.from(await page.screenshot({ type: 'png' }));
await browser.close();

const pdf = await buildPdf([
  { type: 'text', text: 'سلام دنیا! این یک پیام آزمایشی به زبان فارسی است.\nخط دوم با عدد ۱۲۳۴ و کلمهٔ English در وسط جمله.' },
  { type: 'image', data: image, mime: 'image/png', caption: 'این توضیح زیر عکس قرار می‌گیرد 🙂' },
  { type: 'text', text: 'This is a plain English message.\n\nWith a blank line and <b>html</b> & symbols.' },
  { type: 'image', data: image, mime: 'image/png' },
]);
await closeBrowser();

const out = new URL('./sample.pdf', import.meta.url);
await writeFile(out, pdf);
console.log(`Wrote ${out.pathname} (${pdf.length} bytes)`);

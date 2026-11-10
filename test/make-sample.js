// Builds sample PDFs without Telegram, to check Persian rendering, formatting and layout.
// Writes test/sample.pdf (default settings) and test/sample-options.pdf (every option changed).
import { writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { buildPdf } from '../src/pdf.js';

// Make a sample image with the same headless browser.
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 450 });
await page.setContent(
  '<body style="margin:0;height:100vh;background:linear-gradient(135deg,#2b6cb0,#9f7aea);display:grid;place-items:center;font:60px sans-serif;color:#fff">Sample image</body>',
);
const image = Buffer.from(await page.screenshot({ type: 'png' }));
await browser.close();

// Builds a Telegram-style entity for the first occurrence of `part` in `text`.
const entity = (text, part, type, extra = {}) => ({
  type,
  offset: text.indexOf(part),
  length: part.length,
  ...extra,
});

const formatted =
  'این متن پررنگ و این کج است.\n' +
  'Mixed line with bold English and a link.\n' +
  'نقل قول فارسی\nدر دو خط\n' +
  'const x = 1;\nconsole.log(x);\n' +
  'کد درون‌خطی: npm start و پایان.';

const date = 1_794_300_000;
const items = [
  {
    type: 'text',
    text: 'سلام دنیا! این یک پیام آزمایشی به زبان فارسی است.\nخط دوم با عدد ۱۲۳۴ و کلمهٔ English در وسط جمله.',
    from: 'علیرضا',
    date,
  },
  {
    type: 'image',
    data: image,
    mime: 'image/png',
    caption: 'این توضیح زیر عکس قرار می‌گیرد 🙂',
    entities: [entity('این توضیح زیر عکس قرار می‌گیرد 🙂', 'زیر عکس', 'bold')],
    from: 'Channel name',
    date: date + 60,
  },
  {
    type: 'text',
    text: formatted,
    entities: [
      entity(formatted, 'پررنگ', 'bold'),
      entity(formatted, 'کج', 'italic'),
      entity(formatted, 'bold English', 'bold'),
      entity(formatted, 'a link', 'text_link', { url: 'https://example.com' }),
      entity(formatted, 'نقل قول فارسی\nدر دو خط', 'blockquote'),
      entity(formatted, 'const x = 1;\nconsole.log(x);', 'pre'),
      entity(formatted, 'npm start', 'code'),
    ],
    from: 'علیرضا',
    date: date + 120,
  },
  {
    type: 'text',
    text: 'This is a plain English message.\n\nWith a blank line and <b>html</b> & symbols.',
    from: 'Alireza',
    date: date + 180,
  },
  { type: 'image', data: image, mime: 'image/png', from: 'Alireza', date: date + 240 },
];

const outputs = {
  'sample.pdf': {},
  'sample-options.pdf': {
    title: 'گزارش هفتگی — Weekly report',
    settings: { page: 'A5', orientation: 'landscape', font: 'large', image: 'medium', numbers: 'on', info: 'on' },
  },
};

for (const [name, options] of Object.entries(outputs)) {
  const pdf = await buildPdf(items, options);
  const out = new URL(`./${name}`, import.meta.url);
  await writeFile(out, pdf);
  console.log(`Wrote ${out.pathname} (${pdf.length} bytes)`);
}

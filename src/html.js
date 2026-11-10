// Builds the HTML page that headless Chrome prints to PDF.
// Shared by the Cloudflare Worker (src/session.js) and the local preview (src/pdf.js).
import { normalizeSettings } from './settings.js';

// Used for the optional "sender & time" line above each message.
const TIME_ZONE = 'Asia/Tehran';

const PAGE_MM = { A4: [210, 297], A5: [148, 210], Letter: [216, 279] };
const MARGIN_MM = { top: 18, bottom: 18, left: 16, right: 16 };
const FONT_PT = { small: 11, medium: 13, large: 16 };
const IMAGE_WIDTH = { full: '100%', medium: '65%', small: '40%' };

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const SIMPLE_TAGS = {
  bold: 'b',
  italic: 'i',
  underline: 'u',
  strikethrough: 's',
  code: 'code',
  pre: 'pre',
  blockquote: 'blockquote',
  expandable_blockquote: 'blockquote',
};

function entityTags(entity, text) {
  const tag = SIMPLE_TAGS[entity.type];
  if (tag) return [`<${tag}>`, `</${tag}>`];
  let href;
  if (entity.type === 'text_link') href = entity.url;
  if (entity.type === 'url') {
    href = text.slice(entity.offset, entity.offset + entity.length);
    if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) href = `https://${href}`;
  }
  if (href && /^(https?|tg|mailto):/i.test(href)) return [`<a href="${escapeHtml(href)}">`, '</a>'];
  return null;
}

/**
 * Turns a Telegram message text plus its formatting entities (bold, links,
 * code, quotes…) into HTML. Entity offsets are UTF-16 units, like JS strings.
 */
export function formatText(text, entities = []) {
  const spans = entities
    .map((e) => ({ start: e.offset, end: e.offset + e.length, tags: entityTags(e, text) }))
    .filter((s) => s.tags)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let out = '';
  let pos = 0;
  const open = [];
  const closeUpTo = (limit) => {
    while (open.length && open.at(-1).end <= limit) {
      const span = open.pop();
      out += escapeHtml(text.slice(pos, span.end)) + span.tags[1];
      pos = span.end;
    }
  };
  for (const span of spans) {
    closeUpTo(span.start);
    out += escapeHtml(text.slice(pos, span.start)) + span.tags[0];
    pos = span.start;
    // Keep tags properly nested even if an entity overruns its parent.
    if (open.length) span.end = Math.min(span.end, open.at(-1).end);
    open.push(span);
  }
  closeUpTo(text.length);
  out += escapeHtml(text.slice(pos));

  // A block element already starts on its own line; drop the newline next to it.
  return out
    .replace(/\n?(<(?:pre|blockquote)>)/g, '$1')
    .replace(/(<\/(?:pre|blockquote)>)\n?/g, '$1');
}

function infoHtml(item) {
  const parts = [];
  // <bdi> isolates each part, so a Latin name next to a Persian date keeps both readable.
  if (item.from) parts.push(`<bdi>${escapeHtml(item.from)}</bdi>`);
  if (item.date) {
    const date = new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: TIME_ZONE,
    }).format(new Date(item.date * 1000));
    parts.push(`<bdi dir="rtl">${date}</bdi>`);
  }
  // The line follows the name's direction (dir="auto" cannot see inside <bdi>).
  const firstLetter = (item.from ?? '').match(/\p{L}/u)?.[0];
  const dir = !firstLetter || /[֐-ࣿיִ-ﻼ]/.test(firstLetter) ? 'rtl' : 'ltr';
  return parts.length ? `<div class="info" dir="${dir}">${parts.join(' · ')}</div>` : '';
}

function itemHtml(item, showInfo) {
  const info = showInfo ? infoHtml(item) : '';
  if (item.type === 'image') {
    const caption = item.caption
      ? `<figcaption class="body">${formatText(item.caption, item.entities)}</figcaption>`
      : '';
    return `<figure>${info}<img src="${escapeHtml(item.src)}">${caption}</figure>`;
  }
  return `<section>${info}<div class="body">${formatText(item.text, item.entities)}</div></section>`;
}

/** @param {Array<{weight: number, base64: string}>} fonts Vazirmatn woff2 files */
export function fontFaceCss(fonts) {
  return fonts
    .map(
      ({ weight, base64 }) => `@font-face {
        font-family: "Vazirmatn";
        font-weight: ${weight};
        src: url(data:font/woff2;base64,${base64}) format("woff2");
      }`,
    )
    .join('\n');
}

/**
 * @param {Array<object>} items text items `{type:'text', text, entities?}` and image items
 *   `{type:'image', src, caption?, entities?}`; both may carry `from` and `date` (unix seconds)
 * @param {string} fontCss output of fontFaceCss()
 * @param {{settings?: object, title?: string}} [options]
 */
export function buildHtml(items, fontCss, { settings, title } = {}) {
  const s = normalizeSettings(settings);
  const [w, h] = PAGE_MM[s.page];
  const pageHeight = s.orientation === 'landscape' ? w : h;
  // Leave room for a short caption so image and caption stay on one page.
  const maxImageHeight = pageHeight - MARGIN_MM.top - MARGIN_MM.bottom - 30;
  const heading = title ? `<h1 dir="auto">${escapeHtml(title)}</h1>` : '';

  return `<!doctype html>
<html lang="fa">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title || 'Messages')}</title>
<style>
  ${fontCss}
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Vazirmatn", "Noto Color Emoji", "Apple Color Emoji", sans-serif;
    font-size: ${FONT_PT[s.font]}pt;
    line-height: 1.9;
    color: #1a1a1a;
    orphans: 2;
    widows: 2;
  }
  h1 {
    margin: 0 0 16pt;
    padding-bottom: 8pt;
    border-bottom: 1.5pt solid #d0d4da;
    font-size: 1.6em;
    line-height: 1.5;
    text-align: center;
  }
  /* unicode-bidi: plaintext gives every line its own direction: Persian lines
     run right-to-left, English lines left-to-right, each aligned to its start. */
  .body, blockquote {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    unicode-bidi: plaintext;
    text-align: start;
  }
  section, figure { margin: 0 0 18pt; }
  figure { break-inside: avoid; text-align: center; }
  figure img {
    max-width: ${IMAGE_WIDTH[s.image]};
    max-height: ${maxImageHeight}mm;
    border-radius: 4pt;
  }
  figcaption { margin-top: 8pt; }
  .info {
    margin-bottom: 2pt;
    font-size: 0.7em;
    color: #7a8088;
    text-align: start;
    break-after: avoid;
  }
  a { color: #1a5fb4; text-decoration: none; }
  code, pre {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;
    font-size: 0.85em;
    background: #f1f3f5;
    border-radius: 3pt;
  }
  code { padding: 1pt 4pt; }
  pre {
    margin: 6pt 0;
    padding: 8pt 10pt;
    direction: ltr;
    text-align: left;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    break-inside: avoid;
  }
  blockquote {
    margin: 6pt 0;
    padding: 4pt 12pt;
    background: #f6f7f9;
    border-radius: 3pt;
    border-inline: 2.5pt solid #b8c0cc;
    color: #3d4450;
  }
</style>
</head>
<body>${heading}${items.map((item) => itemHtml(item, s.info === 'on')).join('\n')}</body>
</html>`;
}

/** Options for puppeteer's page.pdf(). */
export function pdfOptions(settings) {
  const s = normalizeSettings(settings);
  const numbered = s.numbers === 'on';
  return {
    format: s.page,
    landscape: s.orientation === 'landscape',
    printBackground: true,
    margin: Object.fromEntries(Object.entries(MARGIN_MM).map(([side, mm]) => [side, `${mm}mm`])),
    displayHeaderFooter: numbered,
    headerTemplate: '<span></span>',
    footerTemplate: numbered
      ? '<div style="width:100%;text-align:center;font:8pt sans-serif;color:#8a9099">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      : '<span></span>',
    timeout: 120_000,
  };
}

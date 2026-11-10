// Builds the HTML page that headless Chrome prints to PDF.
// Shared by the local bot (src/pdf.js) and the Cloudflare Worker (src/session.js).

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
    const caption = item.caption ? `<figcaption>${textHtml(item.caption)}</figcaption>` : '';
    return `<figure><img src="${escapeHtml(item.src)}">${caption}</figure>`;
  }
  return `<section class="text">${textHtml(item.text)}</section>`;
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
 * @param {Array<{type: 'text', text: string} | {type: 'image', src: string, caption?: string}>} items
 * @param {string} fontCss output of fontFaceCss()
 */
export function buildHtml(items, fontCss) {
  return `<!doctype html>
<html lang="fa">
<head>
<meta charset="utf-8">
<style>
  ${fontCss}
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
}

export const PDF_OPTIONS = {
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
  timeout: 120_000,
};

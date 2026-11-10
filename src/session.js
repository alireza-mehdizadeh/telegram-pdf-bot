import { DurableObject } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';
import puppeteer from '@cloudflare/puppeteer';
import regularFont from 'vazirmatn/fonts/webfonts/Vazirmatn-Regular.woff2';
import boldFont from 'vazirmatn/fonts/webfonts/Vazirmatn-Bold.woff2';
import { buildHtml, fontFaceCss, pdfOptions } from './html.js';
import { nextValue, normalizeSettings, SETTINGS } from './settings.js';
import { COLLECTING_KEYBOARD, MAX_ITEMS, TEXT } from './texts.js';

// Telegram only guarantees a file download link for one hour, so links older
// than this are looked up again before the PDF is built.
const LINK_MAX_AGE_MS = 45 * 60 * 1000;
// Keeps the build inside the free plan's limit of 50 outgoing requests.
const MAX_LINK_REFRESHES = 40;
// Storage accepts at most this many keys in one delete call.
const DELETE_BATCH = 128;

let fontCss;
function getFontCss() {
  fontCss ??= fontFaceCss([
    { weight: 400, base64: Buffer.from(regularFont).toString('base64') },
    { weight: 700, base64: Buffer.from(boldFont).toString('base64') },
  ]);
  return fontCss;
}

const itemKey = (messageId) => `item:${String(messageId).padStart(12, '0')}`;

function fileName(title) {
  const clean = (title ?? '').replace(/[^\p{L}\p{N}\p{M}‌ _-]/gu, '').trim().slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `${clean || `messages-${stamp}`}.pdf`;
}

/**
 * One instance per Telegram chat. Holds the messages collected since /start,
 * the chat's PDF settings, and builds the PDF. Storage here is consistent, so
 * photos of one album that arrive at the same moment are all kept, in message order.
 *
 * Stored keys: `meta` (current collection), `item:<message id>` (its messages),
 * `settings` (kept between collections).
 */
export class ChatSession extends DurableObject {
  async start(chatId) {
    await this.#clearCollection();
    await this.ctx.storage.put('meta', { chatId, active: true, count: 0 });
  }

  async cancel() {
    await this.#clearCollection();
  }

  /** @returns {Promise<'ok' | 'inactive' | 'building' | 'full'>} */
  async add(messageId, item) {
    const meta = await this.ctx.storage.get('meta');
    if (meta?.building) return 'building';
    if (!meta?.active) return 'inactive';
    const key = itemKey(messageId);
    // Telegram re-delivers an update if our reply was slow; don't count it twice.
    if ((await this.ctx.storage.get(key)) === undefined) {
      if (meta.count >= MAX_ITEMS) return 'full';
      meta.count += 1;
      await this.ctx.storage.put('meta', meta);
    }
    await this.ctx.storage.put(key, item);
    return 'ok';
  }

  /** Removes the most recent message. @returns {Promise<number | 'inactive' | 'building' | 'empty'>} how many are left */
  async undo() {
    const meta = await this.ctx.storage.get('meta');
    if (meta?.building) return 'building';
    if (!meta?.active) return 'inactive';
    const last = await this.ctx.storage.list({ prefix: 'item:', reverse: true, limit: 1 });
    const [key] = last.keys();
    if (!key) return 'empty';
    await this.ctx.storage.delete(key);
    meta.count = Math.max(0, meta.count - 1);
    await this.ctx.storage.put('meta', meta);
    return meta.count;
  }

  /** @returns {Promise<'inactive' | 'building' | {texts: number, images: number, title?: string}>} */
  async status() {
    const meta = await this.ctx.storage.get('meta');
    if (meta?.building) return 'building';
    if (!meta?.active) return 'inactive';
    const items = [...(await this.ctx.storage.list({ prefix: 'item:' })).values()];
    const images = items.filter((item) => item.type === 'image').length;
    return { texts: items.length - images, images, title: meta.title };
  }

  /** @param {string | null} title null removes it. @returns {Promise<'ok' | 'inactive' | 'building'>} */
  async setTitle(title) {
    const meta = await this.ctx.storage.get('meta');
    if (meta?.building) return 'building';
    if (!meta?.active) return 'inactive';
    await this.ctx.storage.put('meta', { ...meta, title: title ?? undefined });
    return 'ok';
  }

  async getSettings() {
    return normalizeSettings(await this.ctx.storage.get('settings'));
  }

  /** Moves one option to its next value and returns all settings. */
  async cycleSetting(key) {
    const settings = await this.getSettings();
    if (key in SETTINGS) {
      settings[key] = nextValue(key, settings[key]);
      await this.ctx.storage.put('settings', settings);
    }
    return settings;
  }

  /** @returns {Promise<'building' | 'inactive' | 'empty' | 'busy'>} */
  async finish() {
    const meta = await this.ctx.storage.get('meta');
    if (meta?.building) return 'busy';
    if (!meta?.active) return 'inactive';
    if (meta.count === 0) return 'empty';
    await this.ctx.storage.put('meta', { ...meta, active: false, building: true });
    // The PDF is built in the alarm, outside the webhook request, so Telegram
    // gets its answer immediately and the build is not cut off by a timeout.
    await this.ctx.storage.setAlarm(Date.now());
    return 'building';
  }

  async alarm() {
    const meta = await this.ctx.storage.get('meta');
    if (!meta?.building) return;
    try {
      const settings = await this.getSettings();
      const stored = await this.ctx.storage.list({ prefix: 'item:' });
      const items = await this.#withImageUrls([...stored.values()]);
      const html = buildHtml(items, getFontCss(), { settings, title: meta.title });
      const pdf = await this.#renderPdf(html, pdfOptions(settings));

      const form = new FormData();
      form.set('chat_id', String(meta.chatId));
      form.set('caption', TEXT.sent(items.length));
      form.set('document', new Blob([pdf], { type: 'application/pdf' }), fileName(meta.title));
      await this.#telegram('sendDocument', form);

      await this.#clearCollection();
    } catch (err) {
      console.error('PDF build failed:', err);
      // Caught here so the alarm is not retried automatically (that could send
      // the PDF twice); the messages are kept and the user can press Done again.
      await this.ctx.storage.put('meta', { ...meta, active: true, building: false });
      await this.#telegram('sendMessage', {
        chat_id: meta.chatId,
        text: TEXT.failed,
        reply_markup: COLLECTING_KEYBOARD,
      }).catch((e) => console.error('Could not report failure:', e));
    }
  }

  /** Removes the collected messages but keeps the chat's settings. */
  async #clearCollection() {
    const keys = [...(await this.ctx.storage.list({ prefix: 'item:' })).keys()];
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      await this.ctx.storage.delete(keys.slice(i, i + DELETE_BATCH));
    }
    await this.ctx.storage.delete('meta');
  }

  // The browser downloads the images itself, straight from Telegram, so the
  // Worker never has to hold image bytes in memory.
  async #withImageUrls(items) {
    let refreshes = 0;
    return Promise.all(
      items.map(async (item) => {
        if (item.type !== 'image') return item;
        let { path } = item;
        if (Date.now() - item.resolvedAt > LINK_MAX_AGE_MS && refreshes < MAX_LINK_REFRESHES) {
          refreshes += 1;
          path = (await this.#telegram('getFile', { file_id: item.fileId })).file_path;
        }
        return { ...item, src: `https://api.telegram.org/file/bot${this.env.BOT_TOKEN}/${path}` };
      }),
    );
  }

  async #renderPdf(html, options) {
    const browser = await puppeteer.launch(this.env.BROWSER);
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: 120_000 });
      await page.evaluate(() => document.fonts.ready);
      return await page.pdf(options);
    } finally {
      await browser.close();
    }
  }

  async #telegram(method, body) {
    const isForm = body instanceof FormData;
    const res = await fetch(`https://api.telegram.org/bot${this.env.BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: isForm ? undefined : { 'content-type': 'application/json' },
      body: isForm ? body : JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description}`);
    return data.result;
  }
}

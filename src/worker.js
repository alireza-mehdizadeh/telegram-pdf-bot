import { Bot, webhookCallback } from 'grammy';
import { CANCEL, COLLECTING_KEYBOARD, DONE, IDLE_KEYBOARD, TEXT } from './texts.js';

// Cloudflare Worker entry point: receives Telegram updates by webhook.
// Collected messages live in a per-chat Durable Object (src/session.js),
// which also builds and sends the PDF.
export { ChatSession } from './session.js';

function createBot(env) {
  const bot = new Bot(env.BOT_TOKEN);
  const session = (ctx) => env.CHATS.get(env.CHATS.idFromName(String(ctx.chat.id)));

  async function collect(ctx, item) {
    const result = await session(ctx).add(ctx.message.message_id, item);
    if (result === 'ok') return ctx.react('👍').catch(() => {});
    if (result === 'full') return ctx.reply(TEXT.full);
    if (result === 'building') return ctx.reply(TEXT.busy);
    return ctx.reply(TEXT.startFirst);
  }

  async function collectImage(ctx, fileId) {
    const file = await ctx.api.getFile(fileId);
    return collect(ctx, {
      type: 'image',
      fileId,
      path: file.file_path,
      resolvedAt: Date.now(),
      caption: ctx.message.caption,
    });
  }

  async function start(ctx) {
    await session(ctx).start(ctx.chat.id);
    return ctx.reply(TEXT.welcome, { reply_markup: COLLECTING_KEYBOARD });
  }

  async function finish(ctx) {
    const result = await session(ctx).finish();
    if (result === 'building') return ctx.reply(TEXT.building, { reply_markup: IDLE_KEYBOARD });
    if (result === 'busy') return ctx.reply(TEXT.busy);
    if (result === 'empty') return ctx.reply(TEXT.empty);
    return ctx.reply(TEXT.startFirst);
  }

  async function cancel(ctx) {
    await session(ctx).cancel();
    return ctx.reply(TEXT.cancelled, { reply_markup: IDLE_KEYBOARD });
  }

  bot.command('start', start);
  bot.command('done', finish);
  bot.command('cancel', cancel);
  bot.hears(DONE, finish);
  bot.hears(CANCEL, cancel);

  bot.on('message:text', (ctx) => collect(ctx, { type: 'text', text: ctx.message.text }));
  bot.on('message:photo', (ctx) => collectImage(ctx, ctx.message.photo.at(-1).file_id));
  // Images sent "as file" (uncompressed).
  bot.on('message:document', (ctx) => {
    const doc = ctx.message.document;
    if (!doc.mime_type?.startsWith('image/')) return ctx.reply(TEXT.unsupported);
    if (doc.file_size > 20 * 1024 * 1024) return ctx.reply(TEXT.tooBig);
    return collectImage(ctx, doc.file_id);
  });
  bot.on('message', (ctx) => ctx.reply(TEXT.unsupported));

  bot.catch((err) => console.error('Bot error:', err.error ?? err));
  return bot;
}

let handler;

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('telegram-pdf-bot is running');
    if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) {
      return new Response('BOT_TOKEN / WEBHOOK_SECRET secrets are not set', { status: 500 });
    }
    // Requests without Telegram's secret header are rejected by grammY.
    handler ??= webhookCallback(createBot(env), 'cloudflare-mod', {
      secretToken: env.WEBHOOK_SECRET,
    });
    return handler(request);
  },
};

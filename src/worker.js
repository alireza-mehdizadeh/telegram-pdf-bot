import { Bot, webhookCallback } from 'grammy';
import { registerAccess } from './admin.js';
import { settingsKeyboard } from './settings.js';
import {
  CANCEL,
  COLLECTING_KEYBOARD,
  DONE,
  IDLE_KEYBOARD,
  MAX_TITLE_LENGTH,
  SETTINGS_BUTTON,
  STATUS,
  TEXT,
  UNDO,
} from './texts.js';

// Cloudflare Worker entry point: receives Telegram updates by webhook.
// Collected messages live in a per-chat Durable Object (src/session.js),
// which also builds and sends the PDF.
export { ChatSession } from './session.js';
// Who may use the bot (src/admin.js holds the request flow and admin panel).
export { AccessList } from './access.js';

// Name shown in the optional "sender & time" line: the original author for
// forwarded messages, otherwise whoever sent the message to the bot.
function senderName(message) {
  const origin = message.forward_origin;
  const user = origin?.sender_user ?? (origin ? undefined : message.from);
  if (user) return [user.first_name, user.last_name].filter(Boolean).join(' ');
  return origin?.sender_user_name ?? origin?.sender_chat?.title ?? origin?.chat?.title;
}

function createBot(env) {
  const bot = new Bot(env.BOT_TOKEN);
  const session = (ctx) => env.CHATS.get(env.CHATS.idFromName(String(ctx.chat.id)));

  // Replies for the states in which nothing can be collected or changed.
  const notCollecting = (ctx, state) =>
    ctx.reply(state === 'building' || state === 'busy' ? TEXT.busy : TEXT.startFirst);

  async function collect(ctx, item) {
    const message = ctx.message;
    const result = await session(ctx).add(message.message_id, {
      ...item,
      from: senderName(message),
      date: message.forward_origin?.date ?? message.date,
    });
    if (result === 'ok') return ctx.react('👍').catch(() => {});
    if (result === 'full') return ctx.reply(TEXT.full);
    return notCollecting(ctx, result);
  }

  async function collectImage(ctx, fileId) {
    const file = await ctx.api.getFile(fileId);
    return collect(ctx, {
      type: 'image',
      fileId,
      path: file.file_path,
      resolvedAt: Date.now(),
      caption: ctx.message.caption,
      entities: ctx.message.caption_entities,
    });
  }

  async function start(ctx) {
    await session(ctx).start(ctx.chat.id);
    return ctx.reply(TEXT.welcome, { reply_markup: COLLECTING_KEYBOARD });
  }

  async function finish(ctx) {
    const result = await session(ctx).finish();
    if (result === 'building') return ctx.reply(TEXT.building, { reply_markup: IDLE_KEYBOARD });
    if (result === 'empty') return ctx.reply(TEXT.empty);
    return notCollecting(ctx, result);
  }

  async function cancel(ctx) {
    await session(ctx).cancel();
    return ctx.reply(TEXT.cancelled, { reply_markup: IDLE_KEYBOARD });
  }

  async function undo(ctx) {
    const result = await session(ctx).undo();
    if (typeof result === 'number') return ctx.reply(TEXT.undone(result));
    if (result === 'empty') return ctx.reply(TEXT.empty);
    return notCollecting(ctx, result);
  }

  async function status(ctx) {
    const result = await session(ctx).status();
    if (typeof result === 'object') return ctx.reply(TEXT.status(result));
    return notCollecting(ctx, result);
  }

  async function title(ctx) {
    const wanted = ctx.match.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE_LENGTH);
    if (!wanted) return ctx.reply(TEXT.titleUsage);
    const remove = wanted === '-';
    const result = await session(ctx).setTitle(remove ? null : wanted);
    if (result !== 'ok') return notCollecting(ctx, result);
    return ctx.reply(remove ? TEXT.titleCleared : TEXT.titleSet(wanted));
  }

  async function settings(ctx) {
    const current = await session(ctx).getSettings();
    return ctx.reply(TEXT.settings, { reply_markup: settingsKeyboard(current) });
  }

  // Outermost: log handler errors instead of letting them escape. An escaped
  // error makes the Worker answer 500, and Telegram then re-sends that same
  // update over and over, holding back every later message. (bot.catch does
  // not apply here: it only covers long polling, not webhooks.)
  bot.use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      console.error(`Update ${ctx.update.update_id} failed:`, err?.stack ?? err);
      await ctx.reply(TEXT.error).catch(() => {});
    }
  });

  // Everything below only runs for the admin and approved users.
  registerAccess(bot, env);

  bot.command('start', start);
  bot.command('done', finish);
  bot.command('cancel', cancel);
  bot.command('undo', undo);
  bot.command('status', status);
  bot.command('title', title);
  bot.command('settings', settings);
  bot.command('help', (ctx) => ctx.reply(TEXT.help));
  bot.hears(DONE, finish);
  bot.hears(CANCEL, cancel);
  bot.hears(UNDO, undo);
  bot.hears(STATUS, status);
  bot.hears(SETTINGS_BUTTON, settings);

  // A tap on one of the buttons under the /settings message.
  bot.callbackQuery(/^set:(\w+)$/, async (ctx) => {
    const updated = await session(ctx).cycleSetting(ctx.match[1]);
    await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(updated) }).catch(() => {});
    return ctx.answerCallbackQuery().catch(() => {});
  });
  bot.on('callback_query', (ctx) => ctx.answerCallbackQuery().catch(() => {}));

  bot.on('message:text', (ctx) => {
    // A mistyped command should not end up in the PDF.
    if (ctx.message.entities?.some((e) => e.type === 'bot_command' && e.offset === 0)) {
      return ctx.reply(TEXT.unknownCommand);
    }
    return collect(ctx, { type: 'text', text: ctx.message.text, entities: ctx.message.entities });
  });
  bot.on('message:photo', (ctx) => collectImage(ctx, ctx.message.photo.at(-1).file_id));
  // Images sent "as file" (uncompressed).
  bot.on('message:document', (ctx) => {
    const doc = ctx.message.document;
    if (!doc.mime_type?.startsWith('image/')) return ctx.reply(TEXT.unsupported);
    if (doc.file_size > 20 * 1024 * 1024) return ctx.reply(TEXT.tooBig);
    return collectImage(ctx, doc.file_id);
  });
  bot.on('message', (ctx) => ctx.reply(TEXT.unsupported));

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

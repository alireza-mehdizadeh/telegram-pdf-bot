import { Bot, InputFile, Keyboard } from 'grammy';
import { buildPdf, closeBrowser } from './pdf.js';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is missing. Copy .env.example to .env and put your bot token in it.');
  process.exit(1);
}

const DONE = '✅ Done / ساخت PDF';
const CANCEL = '🗑 Cancel / لغو';
const MAX_ITEMS = 300;

const bot = new Bot(token);

// chatId -> array of collected items, in the order they were received.
// Kept in memory: an unfinished collection is lost if the bot restarts.
const sessions = new Map();

const collectingKeyboard = new Keyboard().text(DONE).text(CANCEL).resized().persistent();
const idleKeyboard = { remove_keyboard: true };

function startSession(ctx) {
  sessions.set(ctx.chat.id, []);
  return ctx.reply(
    'سلام! هر پیامی (متن یا عکس) بفرستید جمع می‌شود. در پایان «Done» را بزنید تا همه در یک PDF ساخته شود.\n\n' +
      'Send me text and photos. When you are finished, press “Done” and I will put everything into one PDF.',
    { reply_markup: collectingKeyboard },
  );
}

async function downloadFile(fileId) {
  const file = await bot.api.getFile(fileId);
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function mimeFromBytes(buf, fallback = 'image/jpeg') {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF') return 'image/webp';
  if (buf.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  return fallback;
}

async function finish(ctx) {
  const items = sessions.get(ctx.chat.id);
  if (!items) return ctx.reply('ابتدا /start را بزنید.\nSend /start first.');
  if (items.length === 0) {
    return ctx.reply('هنوز پیامی نفرستاده‌اید.\nNothing to put in the PDF yet — send some messages first.');
  }
  sessions.delete(ctx.chat.id);

  const status = await ctx.reply('⏳ در حال ساخت PDF…', { reply_markup: idleKeyboard });
  try {
    await ctx.replyWithChatAction('upload_document');
    const resolved = await Promise.all(
      items.map(async (item) => {
        if (item.type !== 'image') return item;
        const data = await downloadFile(item.fileId);
        return { type: 'image', data, mime: mimeFromBytes(data, item.mime), caption: item.caption };
      }),
    );
    const pdf = await buildPdf(resolved);
    const name = `messages-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.pdf`;
    await ctx.replyWithDocument(new InputFile(pdf, name), {
      caption: `${items.length} پیام · برای شروع دوباره /start را بزنید.`,
    });
  } catch (err) {
    console.error('PDF build failed:', err);
    // Give the messages back so the user can retry without resending them.
    sessions.set(ctx.chat.id, [...items, ...(sessions.get(ctx.chat.id) ?? [])]);
    await ctx.reply('❌ ساخت PDF ناموفق بود؛ پیام‌ها حفظ شده‌اند، دوباره «Done» را بزنید.\nPDF failed — your messages are kept, press Done to retry.', {
      reply_markup: collectingKeyboard,
    });
  } finally {
    await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {});
  }
}

function cancel(ctx) {
  sessions.delete(ctx.chat.id);
  return ctx.reply('لغو شد. برای شروع دوباره /start را بزنید.\nCancelled. Send /start to begin again.', {
    reply_markup: idleKeyboard,
  });
}

// Adds an item to the chat's collection; returns false if it was not accepted.
async function collect(ctx, item) {
  const items = sessions.get(ctx.chat.id);
  if (!items) {
    await ctx.reply('ابتدا /start را بزنید.\nSend /start first.');
    return false;
  }
  if (items.length >= MAX_ITEMS) {
    await ctx.reply(`حداکثر ${MAX_ITEMS} پیام. «Done» را بزنید.\nLimit of ${MAX_ITEMS} messages reached — press Done.`);
    return false;
  }
  items.push(item);
  await ctx.react('👍').catch(() => {});
  return true;
}

bot.command('start', startSession);
bot.command('done', finish);
bot.command('cancel', cancel);
bot.hears(DONE, finish);
bot.hears(CANCEL, cancel);

bot.on('message:text', (ctx) => collect(ctx, { type: 'text', text: ctx.message.text }));

bot.on('message:photo', (ctx) => {
  const largest = ctx.message.photo.at(-1);
  return collect(ctx, { type: 'image', fileId: largest.file_id, caption: ctx.message.caption });
});

// Images sent "as file" (uncompressed).
bot.on('message:document', (ctx) => {
  const doc = ctx.message.document;
  if (!doc.mime_type?.startsWith('image/')) {
    return ctx.reply('فقط متن و عکس پشتیبانی می‌شود.\nOnly text and images are supported.');
  }
  if (doc.file_size > 20 * 1024 * 1024) {
    return ctx.reply('این فایل بزرگ‌تر از ۲۰ مگابایت است.\nThis file is over 20 MB, which bots cannot download.');
  }
  return collect(ctx, { type: 'image', fileId: doc.file_id, mime: doc.mime_type, caption: ctx.message.caption });
});

bot.on('message', (ctx) => ctx.reply('فقط متن و عکس پشتیبانی می‌شود.\nOnly text and images are supported.'));

bot.catch((err) => console.error('Bot error:', err.error ?? err));

await bot.api.setMyCommands([
  { command: 'start', description: 'شروع جمع‌آوری پیام‌ها' },
  { command: 'done', description: 'ساخت PDF' },
  { command: 'cancel', description: 'لغو' },
]);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await bot.stop();
    await closeBrowser();
  });
}

bot.start({ onStart: (me) => console.log(`@${me.username} is running`) });

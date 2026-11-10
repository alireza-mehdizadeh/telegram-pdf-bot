// Labels and replies used by the Cloudflare Worker version of the bot.

export const DONE = '✅ Done / ساخت PDF';
export const CANCEL = '🗑 Cancel / لغو';
export const MAX_ITEMS = 300;

export const COLLECTING_KEYBOARD = {
  keyboard: [[{ text: DONE }, { text: CANCEL }]],
  resize_keyboard: true,
  is_persistent: true,
};
export const IDLE_KEYBOARD = { remove_keyboard: true };

export const TEXT = {
  welcome:
    'سلام! هر پیامی (متن یا عکس) بفرستید جمع می‌شود. در پایان «Done» را بزنید تا همه در یک PDF ساخته شود.\n\n' +
    'Send me text and photos. When you are finished, press “Done” and I will put everything into one PDF.',
  startFirst: 'ابتدا /start را بزنید.\nSend /start first.',
  empty: 'هنوز پیامی نفرستاده‌اید.\nNothing to put in the PDF yet — send some messages first.',
  building: '⏳ در حال ساخت PDF…',
  busy: '⏳ PDF قبلی هنوز در حال ساخت است.\nThe previous PDF is still being built.',
  cancelled: 'لغو شد. برای شروع دوباره /start را بزنید.\nCancelled. Send /start to begin again.',
  full: `حداکثر ${MAX_ITEMS} پیام. «Done» را بزنید.\nLimit of ${MAX_ITEMS} messages reached — press Done.`,
  unsupported: 'فقط متن و عکس پشتیبانی می‌شود.\nOnly text and images are supported.',
  tooBig: 'این فایل بزرگ‌تر از ۲۰ مگابایت است.\nThis file is over 20 MB, which bots cannot download.',
  failed:
    '❌ ساخت PDF ناموفق بود؛ پیام‌ها حفظ شده‌اند، دوباره «Done» را بزنید.\n' +
    'PDF failed — your messages are kept, press Done to retry.',
  sent: (count) => `${count} پیام · برای شروع دوباره /start را بزنید.`,
};

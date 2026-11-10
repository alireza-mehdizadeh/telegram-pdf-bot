// Labels and replies used by the bot.

export const DONE = '✅ Done / ساخت PDF';
export const UNDO = '↩️ Undo / حذف آخری';
export const STATUS = '📊 Status / وضعیت';
export const SETTINGS_BUTTON = '⚙️ Settings / تنظیمات';
export const CANCEL = '🗑 Cancel / لغو';
export const MAX_ITEMS = 300;
export const MAX_TITLE_LENGTH = 120;

// Shown while messages are being collected.
export const COLLECTING_KEYBOARD = {
  keyboard: [
    [{ text: DONE }],
    [{ text: UNDO }, { text: STATUS }],
    [{ text: SETTINGS_BUTTON }, { text: CANCEL }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};
export const IDLE_KEYBOARD = { remove_keyboard: true };

// The "/" menu next to the message box.
export const COMMANDS = [
  { command: 'start', description: 'شروع جمع‌آوری / Start collecting' },
  { command: 'done', description: 'ساخت PDF / Build the PDF' },
  { command: 'title', description: 'عنوان PDF / Set the PDF title' },
  { command: 'undo', description: 'حذف آخرین پیام / Remove last message' },
  { command: 'status', description: 'وضعیت / What is collected so far' },
  { command: 'settings', description: 'تنظیمات PDF / PDF options' },
  { command: 'cancel', description: 'لغو / Discard everything' },
  { command: 'help', description: 'راهنما / Help' },
];

// Added to the admin's own command menu only.
export const ADMIN_COMMAND = { command: 'admin', description: 'مدیریت کاربران / Manage users' };

export const TEXT = {
  privateBot:
    '🔒 این ربات خصوصی است. برای استفاده، درخواست دسترسی بفرستید.\n' +
    'This bot is private. Send an access request to use it.',
  requestSent:
    '📨 درخواست شما فرستاده شد. پس از تأیید مدیر به شما خبر می‌دهم.\n' +
    'Your request was sent. I will tell you when the admin approves it.',
  requestWaiting: '⏳ درخواست شما در انتظار تأیید مدیر است.\nYour request is waiting for the admin.',
  accessGranted:
    '✅ دسترسی شما تأیید شد. برای شروع /start را بزنید.\nYou now have access. Send /start to begin.',
  accessDenied: '🚫 شما به این ربات دسترسی ندارید.\nYou do not have access to this bot.',
  newRequest: (who) => `📨 درخواست دسترسی جدید / New access request\n${who}`,
  adminPanel:
    '🛠 مدیریت کاربران — یک فهرست را باز کنید.\nUser management — open a list to approve, deny or remove people.',
  adminEmptyList: '— خالی / empty —',
  welcome:
    'سلام! هر پیامی (متن یا عکس) بفرستید جمع می‌شود. در پایان «Done» را بزنید تا همه در یک PDF ساخته شود.\n\n' +
    'Send me text and photos. When you are finished, press “Done” and I will put everything into one PDF.\n\n' +
    '/title عنوان — عنوان PDF · /settings — تنظیمات · /help — راهنما',
  help:
    '📖 راهنما / Help\n\n' +
    '/start — شروع جمع‌آوری / start collecting\n' +
    'سپس متن و عکس بفرستید؛ قالب‌بندی (پررنگ، لینک، کد، نقل‌قول) حفظ می‌شود.\n' +
    'Then send text and photos; formatting (bold, links, code, quotes) is kept.\n\n' +
    '/done — ساخت PDF / build the PDF\n' +
    '/title عنوان — عنوان بالای PDF و نام فایل / heading and file name\n' +
    '/undo — حذف آخرین پیام / remove the last message\n' +
    '/status — تعداد پیام‌های جمع‌شده / what is collected\n' +
    '/settings — اندازه صفحه، متن، عکس، شماره صفحه… / page, text and image options\n' +
    '/cancel — لغو / discard everything',
  startFirst: 'ابتدا /start را بزنید.\nSend /start first.',
  empty: 'هنوز پیامی نفرستاده‌اید.\nNothing to put in the PDF yet — send some messages first.',
  building: '⏳ در حال ساخت PDF…',
  busy: '⏳ PDF قبلی هنوز در حال ساخت است.\nThe previous PDF is still being built.',
  cancelled: 'لغو شد. برای شروع دوباره /start را بزنید.\nCancelled. Send /start to begin again.',
  full: `حداکثر ${MAX_ITEMS} پیام. «Done» را بزنید.\nLimit of ${MAX_ITEMS} messages reached — press Done.`,
  unsupported: 'فقط متن و عکس پشتیبانی می‌شود.\nOnly text and images are supported.',
  unknownCommand: 'این دستور را نمی‌شناسم. /help را ببینید.\nUnknown command — see /help.',
  tooBig: 'این فایل بزرگ‌تر از ۲۰ مگابایت است.\nThis file is over 20 MB, which bots cannot download.',
  failed:
    '❌ ساخت PDF ناموفق بود؛ پیام‌ها حفظ شده‌اند، دوباره «Done» را بزنید.\n' +
    'PDF failed — your messages are kept, press Done to retry.',
  sent: (count) => `${count} پیام · برای شروع دوباره /start را بزنید.`,
  undone: (left) => `↩️ آخرین پیام حذف شد؛ ${left} پیام مانده.\nLast message removed; ${left} left.`,
  titleSet: (title) => `📝 عنوان: ${title}`,
  titleCleared: 'عنوان حذف شد.\nTitle removed.',
  titleUsage:
    'عنوان را بعد از دستور بنویسید، مثلاً:\n/title گزارش هفتگی\n\n' +
    'Write the title after the command. Send “/title -” to remove it.',
  status: ({ texts, images, title }) =>
    `📊 ${texts} متن و ${images} عکس جمع شده است.\n${texts} text and ${images} image message(s) collected.` +
    (title ? `\n📝 ${title}` : ''),
  settings:
    '⚙️ تنظیمات PDF — برای تغییر، روی هر گزینه بزنید.\nPDF options — tap an option to change it. They are remembered for next time.',
};

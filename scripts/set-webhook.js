// Points Telegram at the deployed Worker.
// Usage: npm run webhook -- https://telegram-pdf-bot.<your-subdomain>.workers.dev
// Reads BOT_TOKEN and WEBHOOK_SECRET from .env.

const { BOT_TOKEN, WEBHOOK_SECRET } = process.env;
const url = process.argv[2];

if (!BOT_TOKEN || !WEBHOOK_SECRET || !url?.startsWith('https://')) {
  console.error('Need BOT_TOKEN and WEBHOOK_SECRET in .env, and the Worker https URL as the argument.');
  process.exit(1);
}

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method} failed: ${data.description}`);
  return data.result;
}

await call('setWebhook', {
  url,
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message'],
});
await call('setMyCommands', {
  commands: [
    { command: 'start', description: 'شروع جمع‌آوری پیام‌ها' },
    { command: 'done', description: 'ساخت PDF' },
    { command: 'cancel', description: 'لغو' },
  ],
});

const info = await call('getWebhookInfo', {});
console.log(`Webhook set: ${info.url}`);
if (info.last_error_message) console.log(`Last delivery error: ${info.last_error_message}`);

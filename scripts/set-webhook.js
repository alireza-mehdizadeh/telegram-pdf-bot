// Points Telegram at the deployed Worker and installs the bot's command menu.
// Usage: npm run webhook -- https://telegram-pdf-bot.<your-subdomain>.workers.dev
// Reads BOT_TOKEN and WEBHOOK_SECRET from .env.
import { COMMANDS } from '../src/texts.js';

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
  // callback_query = taps on the buttons of the /settings message.
  allowed_updates: ['message', 'callback_query'],
});
await call('setMyCommands', { commands: COMMANDS });
// The button next to the message box opens the command list.
await call('setChatMenuButton', { menu_button: { type: 'commands' } });

const info = await call('getWebhookInfo', {});
console.log(`Webhook set: ${info.url} (${info.allowed_updates?.join(', ')})`);
if (info.last_error_message) console.log(`Last delivery error: ${info.last_error_message}`);

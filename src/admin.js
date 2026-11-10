import { ADMIN_COMMAND, COMMANDS, TEXT } from './texts.js';

// Access control: only the admin and people the admin approved can use the bot.
// Everyone else can send an access request, which the admin approves or denies
// from the request notification or from the /admin panel.

// Telegram shows at most 100 buttons per message; one or two per listed user.
const LIST_LIMIT = 40;

const LISTS = {
  pending: '⏳ در انتظار / Waiting',
  approved: '👥 مجاز / Allowed',
  denied: '🚫 رد شده / Denied',
};

const profile = (user) => ({
  id: user.id,
  name: [user.first_name, user.last_name].filter(Boolean).join(' '),
  username: user.username,
});

const describe = (user) =>
  `${user.name || '—'}${user.username ? ` (@${user.username})` : ''} — ${user.id}`;

const button = (text, data) => ({ text, callback_data: data });

/** Must be registered before every other handler. */
export function registerAccess(bot, env) {
  const registry = env.ACCESS.get(env.ACCESS.idFromName('registry'));

  async function panel() {
    const counts = await registry.counts();
    return {
      text: TEXT.adminPanel,
      reply_markup: {
        inline_keyboard: Object.entries(LISTS).map(([status, label]) => [
          button(`${label} (${counts[status]})`, `adm:list:${status}`),
        ]),
      },
    };
  }

  async function listView(status) {
    const users = await registry.list(status);
    const shown = users.slice(0, LIST_LIMIT);
    const lines = shown.map((user, i) => `${i + 1}. ${describe(user)}`);
    if (users.length > shown.length) lines.push(`… +${users.length - shown.length}`);
    const short = (user, i) => `${i + 1}. ${(user.name || String(user.id)).slice(0, 20)}`;
    const rows = shown.map((user, i) => {
      const set = (to) => `adm:set:${to}:${user.id}:${status}`;
      if (status === 'pending') return [button(`✅ ${short(user, i)}`, set('approved')), button('❌', set('denied'))];
      if (status === 'approved') return [button(`🗑 ${short(user, i)}`, set('denied'))];
      return [button(`✅ ${short(user, i)}`, set('approved'))];
    });
    rows.push([button('« بازگشت / Back', 'adm:home')]);
    return {
      text: `${LISTS[status]} (${users.length})\n\n${lines.join('\n') || TEXT.adminEmptyList}`,
      reply_markup: { inline_keyboard: rows },
    };
  }

  const show = (ctx, view) =>
    ctx.editMessageText(view.text, { reply_markup: view.reply_markup }).catch(() => {});

  bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return;
    const { role, bound } = await registry.check(profile(ctx.from), env.ADMIN_USERNAME);
    ctx.role = role;
    if (bound) {
      // Only the admin sees /admin in their command menu.
      await ctx.api
        .setMyCommands([...COMMANDS, ADMIN_COMMAND], { scope: { type: 'chat', chat_id: ctx.from.id } })
        .catch((err) => console.error('Could not set admin commands:', err));
    }
    if (role === 'admin' || role === 'approved') return next();

    // Not allowed (yet): the only thing they can do is ask for access.
    if (ctx.callbackQuery?.data === 'req') {
      const result = await registry.request(profile(ctx.from));
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(result.status === 'denied' ? TEXT.accessDenied : TEXT.requestSent).catch(() => {});
      if (result.created && result.adminId) {
        const user = profile(ctx.from);
        await ctx.api
          .sendMessage(result.adminId, TEXT.newRequest(describe(user)), {
            reply_markup: {
              inline_keyboard: [
                [
                  button('✅ تأیید / Approve', `adm:set:approved:${user.id}:notice`),
                  button('❌ رد / Deny', `adm:set:denied:${user.id}:notice`),
                ],
              ],
            },
          })
          .catch((err) => console.error('Could not notify admin:', err));
      }
      return;
    }
    if (ctx.callbackQuery) return ctx.answerCallbackQuery();
    if (ctx.chat?.type !== 'private') return;
    if (role === 'pending') return ctx.reply(TEXT.requestWaiting);
    if (role === 'denied') return ctx.reply(TEXT.accessDenied);
    return ctx.reply(TEXT.privateBot, {
      reply_markup: { inline_keyboard: [[button('📨 درخواست دسترسی / Request access', 'req')]] },
    });
  });

  bot.command('admin', async (ctx) => {
    if (ctx.role !== 'admin') return ctx.reply(TEXT.unknownCommand);
    const view = await panel();
    return ctx.reply(view.text, { reply_markup: view.reply_markup });
  });

  bot.callbackQuery(/^adm:/, async (ctx) => {
    if (ctx.role !== 'admin') return ctx.answerCallbackQuery();
    const [, action, a, b, c] = ctx.callbackQuery.data.split(':');
    await ctx.answerCallbackQuery();

    if (action === 'home') return show(ctx, await panel());
    if (action === 'list' && a in LISTS) return show(ctx, await listView(a));
    if (action !== 'set' || !['approved', 'denied'].includes(a)) return;

    // adm:set:<new status>:<user id>:<list to go back to, or "notice">
    const user = await registry.setStatus(Number(b), a);
    if (user) {
      await ctx.api
        .sendMessage(user.id, a === 'approved' ? TEXT.accessGranted : TEXT.accessDenied)
        .catch((err) => console.error('Could not notify user:', err));
    }
    if (c in LISTS) return show(ctx, await listView(c));
    const outcome = a === 'approved' ? '✅ تأیید شد / Approved' : '❌ رد شد / Denied';
    return ctx.editMessageText(`${outcome}\n${user ? describe(user) : b}`).catch(() => {});
  });
}

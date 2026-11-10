// Per-chat PDF options. Each one cycles through its values when its button
// in the /settings menu is tapped. The first value is the default.

export const SETTINGS = {
  page: {
    label: '📄 صفحه / Page',
    values: { A4: 'A4', A5: 'A5', Letter: 'Letter' },
  },
  orientation: {
    label: '🔄 جهت / Orientation',
    values: { portrait: 'عمودی / Portrait', landscape: 'افقی / Landscape' },
  },
  font: {
    label: '🔠 اندازه متن / Text size',
    values: { medium: 'متوسط / Medium', large: 'بزرگ / Large', small: 'کوچک / Small' },
  },
  image: {
    label: '🖼 اندازه عکس / Image size',
    values: { full: 'کامل / Full', medium: 'متوسط / Medium', small: 'کوچک / Small' },
  },
  numbers: {
    label: '🔢 شماره صفحه / Page numbers',
    values: { on: '✅', off: '❌' },
  },
  info: {
    label: '🕒 فرستنده و زمان / Sender & time',
    values: { off: '❌', on: '✅' },
  },
};

export const DEFAULT_SETTINGS = Object.fromEntries(
  Object.entries(SETTINGS).map(([key, { values }]) => [key, Object.keys(values)[0]]),
);

/** Fills in defaults and drops unknown keys or values (e.g. from an older version). */
export function normalizeSettings(stored = {}) {
  return Object.fromEntries(
    Object.entries(SETTINGS).map(([key, { values }]) => [
      key,
      stored[key] in values ? stored[key] : DEFAULT_SETTINGS[key],
    ]),
  );
}

export function nextValue(key, current) {
  const options = Object.keys(SETTINGS[key].values);
  return options[(options.indexOf(current) + 1) % options.length];
}

/** Inline keyboard for the /settings message: one button per option. */
export function settingsKeyboard(settings) {
  return {
    inline_keyboard: Object.entries(SETTINGS).map(([key, { label, values }]) => [
      { text: `${label}: ${values[settings[key]]}`, callback_data: `set:${key}` },
    ]),
  };
}

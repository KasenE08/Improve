// Money tab data, saved under Improve's own key: imp_money. Amounts are whole cents.
import * as store from '../store.js';

const KEY = 'money';

export const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Food & drinks', icon: 'diet', budget: 0 },
  { id: 'gas', name: 'Gas & transport', icon: 'gas', budget: 0 },
  { id: 'fun', name: 'Fun', icon: 'game', budget: 0 },
  { id: 'shopping', name: 'Shopping', icon: 'bag', budget: 0 },
  { id: 'bills', name: 'Bills & subscriptions', icon: 'keys', budget: 0 },
  { id: 'health', name: 'Health & care', icon: 'pill', budget: 0 },
  { id: 'other', name: 'Other', icon: 'cash', budget: 0 },
];

export const DEFAULT_SETTINGS = {
  currency: '$',
  // anchor: any known payday (YYYY-MM-DD) for weekly / every-2-weeks schedules
  pay: { freq: 'biweekly', anchor: null, days: [1, 15], day: 1 },
  // Older versions: how much to save per paycheck. Only read once, to build the paycheck split below.
  save: { mode: 'amount', amount: 4000, percent: 20 },
  // How each paycheck is divided between accounts (see logic.js splitPaycheck). null = from `save`.
  split: null,
  setup: false, // true once paydays are set in Money → Settings
  // Card cash back: rate in % of spending (0 = off), paid into this account about once a month
  cashback: { rate: 0, account: 'savings' },
  // What Savings is building toward (the bar at the top of Money)
  goal: { name: 'Motorcycle', target: 500000, account: 'savings' },
  // Payday split (see logic.js paydaySplit): %s, the checking cap, the last paycheck typed,
  // the investing account, and `base` = the balances the running totals start from
  payday: null,
};
const PAYDAY = { pct: { checking: 40, savings: 40, investing: 20 }, cap: 20000, last: 22200 };

const empty = () => ({
  version: 3,
  settings: structuredClone(DEFAULT_SETTINGS),
  categories: structuredClone(DEFAULT_CATEGORIES),
  entries: [], // { id, kind: 'expense'|'income'|'saving', amount, cat?, note, date, at }
  reviews: {}, // { 'YYYY-MM': { doneAt } }
  accounts: [], // { id, name, icon, start (cents), since (ISO) }; empty until set up (see logic.js balances)
});

export function getState() {
  let s = store.get(KEY, null);
  if (!s) return empty();
  // Version 2: paid weekly on Fridays (new job); the savings goal starts as a $5,000 motorcycle
  if ((s.version || 1) < 2) {
    const fri = new Date(); fri.setDate(fri.getDate() - ((fri.getDay() + 2) % 7)); // last Friday
    const key = `${fri.getFullYear()}-${String(fri.getMonth() + 1).padStart(2, '0')}-${String(fri.getDate()).padStart(2, '0')}`;
    s = { ...s, version: 2, settings: { ...s.settings, pay: { ...DEFAULT_SETTINGS.pay, ...s.settings?.pay, freq: 'weekly', anchor: key } } };
    store.set(KEY, s);
  }
  // Version 3 (Nov 20, 2026): Greenlight. Accounts named Spend / Save / Invest, starting balances from the
  // bank, the 40/40/20 payday split with a $200 cap. Only for this phone's data (it has the Investing account).
  if (s.version < 3) {
    s = { ...s, version: 3 };
    const INV = 'a_mvr7gm5k92fu4';
    if ((s.accounts || []).some((a) => a.id === INV)) {
      const names = { checking: 'Spend', savings: 'Save', [INV]: 'Invest' };
      s.accounts = s.accounts.map((a) => (names[a.id] ? { ...a, name: names[a.id] } : a));
      const at = new Date().toISOString();
      const now = new Date(at);
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const bal = { checking: 7611, savings: 108933, [INV]: 2397 };
      s.entries = [...(s.entries || []), { id: 'greenlight-start', kind: 'checkin', source: 'setup', balances: bal, amount: 0, note: 'Greenlight balances', date: day, at }];
      s.settings = { ...s.settings, payday: { ...PAYDAY, investing: INV, base: { savings: bal.savings, investing: bal[INV], at } } };
    }
    store.set(KEY, s);
  }
  const d = DEFAULT_SETTINGS;
  const settings = { ...d, ...s.settings, pay: { ...d.pay, ...s.settings?.pay }, save: { ...d.save, ...s.settings?.save }, cashback: { ...d.cashback, ...s.settings?.cashback }, goal: { ...d.goal, ...s.settings?.goal } };
  settings.split ||= splitFromSave(settings.save);
  settings.payday = { ...PAYDAY, ...s.settings?.payday, pct: { ...PAYDAY.pct, ...s.settings?.payday?.pct } };
  return { ...empty(), ...s, settings };
}
// The old "save X% / $X per paycheck" becomes the first paycheck split: that much to Savings, the rest to Checking.
function splitFromSave(sv) {
  const percent = sv.mode === 'percent';
  return { rest: 'checking', parts: [{ account: 'savings', mode: percent ? 'percent' : 'amount', value: percent ? sv.percent : sv.amount }] };
}
const save = (s) => store.set(KEY, s);
const update = (fn) => { const s = getState(); fn(s); save(s); return s; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const saveSettings = (settings) => update((s) => { s.settings = { ...s.settings, ...settings }; });
export const saveCategories = (categories) => update((s) => { s.categories = categories; });
export const saveAccounts = (accounts) => update((s) => { s.accounts = accounts; });

export function upsertEntry(e) {
  return update((s) => {
    const entry = { ...e, id: e.id || uid(), at: e.at || new Date().toISOString() };
    const i = s.entries.findIndex((x) => x.id === entry.id);
    if (i >= 0) s.entries[i] = entry; else s.entries.push(entry);
  });
}
export const deleteEntry = (id) => update((s) => { s.entries = s.entries.filter((e) => e.id !== id); });

export const setReview = (mk, done) => update((s) => {
  s.reviews ||= {};
  if (done) s.reviews[mk] = { doneAt: new Date().toISOString() }; else delete s.reviews[mk];
});

export const newCategoryId = uid;

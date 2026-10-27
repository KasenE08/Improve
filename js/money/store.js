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
};

const empty = () => ({
  version: 1,
  settings: structuredClone(DEFAULT_SETTINGS),
  categories: structuredClone(DEFAULT_CATEGORIES),
  entries: [], // { id, kind: 'expense'|'income'|'saving', amount, cat?, note, date, at }
  reviews: {}, // { 'YYYY-MM': { doneAt } }
  accounts: [], // { id, name, icon, start (cents), since (ISO) }; empty until set up (see logic.js balances)
});

export function getState() {
  const s = store.get(KEY, null);
  if (!s) return empty();
  const d = DEFAULT_SETTINGS;
  const settings = { ...d, ...s.settings, pay: { ...d.pay, ...s.settings?.pay }, save: { ...d.save, ...s.settings?.save } };
  settings.split ||= splitFromSave(settings.save);
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

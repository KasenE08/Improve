// Money tab: pure logic (no DOM, no storage). Amounts are whole cents.
import { dayKey, fromDayKey, addDays, periodRange, appNow } from '../dates.js';

export const FREQS = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
  irregular: 'Irregular',
};

// "12.5" / "$1,234.56" / 12.5 → 1250. Returns NaN for junk.
export function toCents(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function fmtMoney(cents, cur = '$') {
  const neg = cents < 0;
  const v = Math.abs(cents) / 100;
  const s = v.toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
  return `${neg ? '−' : ''}${cur}${s}`;
}

export const monthKey = (key) => key.slice(0, 7);
export const monthRange = (mk) => {
  const [y, m] = mk.split('-').map(Number);
  return [`${mk}-01`, dayKey(new Date(y, m, 0))];
};
export const shiftMonth = (mk, n) => {
  const [y, m] = mk.split('-').map(Number);
  return dayKey(new Date(y, m - 1 + n, 1)).slice(0, 7);
};
export const monthLabel = (mk) => {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const daysBetween = (a, b) => Math.round((fromDayKey(b) - fromDayKey(a)) / 86400000);
const clampDay = (y, m, d) => Math.min(d, new Date(y, m + 1, 0).getDate()); // m is 0-based

// Expected paydays (day keys) from start to end, inclusive, for a pay schedule.
//   weekly / biweekly: repeat every 7 / 14 days from `anchor` (any known payday)
//   semimonthly: `days` of each month, e.g. [1, 15] (31 → last day of short months)
//   monthly: `day` of each month
//   irregular: none (only logged paychecks count)
export function paydaysBetween(pay, start, end) {
  const out = [];
  if (!pay) return out;
  if (pay.freq === 'weekly' || pay.freq === 'biweekly') {
    if (!pay.anchor) return out;
    const step = pay.freq === 'weekly' ? 7 : 14;
    const k = Math.ceil(daysBetween(pay.anchor, start) / step);
    for (let d = addDays(fromDayKey(pay.anchor), k * step); dayKey(d) <= end; d = addDays(d, step)) out.push(dayKey(d));
    return out;
  }
  if (pay.freq === 'semimonthly' || pay.freq === 'monthly') {
    const days = pay.freq === 'monthly' ? [pay.day || 1] : (pay.days || [1, 15]);
    const s = fromDayKey(start);
    for (let y = s.getFullYear(), m = s.getMonth(); dayKey(new Date(y, m, 1)) <= end; m++) {
      for (const d of [...new Set(days)].sort((a, b) => a - b)) {
        const k = dayKey(new Date(y, m, clampDay(y, m, d)));
        if (k >= start && k <= end && !out.includes(k)) out.push(k);
      }
    }
    return out.sort();
  }
  return out;
}

export function nextPayday(pay, fromKey) {
  return paydaysBetween(pay, fromKey, dayKey(addDays(fromDayKey(fromKey), 400)))[0] || null;
}

// How much to save from one paycheck (cents)
export function saveTarget(save, paycheckCents) {
  if (save.mode === 'percent') return Math.round((paycheckCents || 0) * (save.percent || 0) / 100);
  return save.amount || 0;
}

export const inRange = (entries, start, end) => entries.filter((e) => e.date >= start && e.date <= end);
export const sum = (list) => list.reduce((s, e) => s + e.amount, 0);

// The "Save from paycheck" check for the Mon–Sun week containing `date`.
//   judge: false until paydays are set up
//   offWeek: no payday expected and no paycheck logged → counts as done (nothing to save)
//   hit: saved this week ≥ what this week's paycheck(s) call for
export function saveStatus(state, date = appNow()) {
  const { settings, entries } = state;
  const [start, end] = periodRange('weekly', date);
  const expected = paydaysBetween(settings.pay, start, end);
  const week = inRange(entries, start, end);
  const incomes = week.filter((e) => e.kind === 'income');
  const saved = sum(week.filter((e) => e.kind === 'saving' && !beforeTracking(state, e)));
  const base = { judge: !!settings.setup, start, end, expected, incomes, saved };
  if (!expected.length && !incomes.length) return { ...base, offWeek: true, required: 0, pending: false, hit: true };
  let required;
  let pending = false;
  if (settings.save.mode === 'percent') {
    required = incomes.reduce((s, e) => s + saveTarget(settings.save, e.amount), 0);
    pending = incomes.length < expected.length; // payday came but paycheck not logged yet
  } else {
    required = saveTarget(settings.save) * Math.max(expected.length, incomes.length);
  }
  const hit = !pending && required > 0 && saved >= required;
  return { ...base, offWeek: false, required, pending, hit };
}

// Spending summary for a month: { spent, income, saved, byCat: {catId: cents}, budget }
export function monthSummary(state, mk) {
  const [start, end] = monthRange(mk);
  const list = inRange(state.entries, start, end);
  const byCat = {};
  for (const e of list) if (e.kind === 'expense') byCat[e.cat] = (byCat[e.cat] || 0) + e.amount;
  return {
    spent: sum(list.filter((e) => e.kind === 'expense')),
    income: sum(list.filter((e) => e.kind === 'income')),
    saved: sum(list.filter((e) => e.kind === 'saving')),
    byCat,
    budget: state.categories.reduce((s, c) => s + (c.budget || 0), 0),
  };
}

// The review the Today habit is waiting on: named after the month its habit month starts in.
// e.g. Tue Dec 1 is still in the Nov 2 – Dec 6 habit month, so it's the November review.
export const reviewMonth = (date = appNow()) => periodRange('monthly', date)[0].slice(0, 7);

// "Budget review" habit: a review finished at any point during the habit's month
// (first Monday → day before next month's first Monday). Budgets themselves stay on calendar months.
export function reviewDone(state, date = appNow()) {
  const [start, end] = periodRange('monthly', date);
  return Object.values(state.reviews || {}).some((r) => {
    if (!r?.doneAt) return false;
    const k = dayKey(appNow(new Date(r.doneAt)));
    return k >= start && k <= end;
  });
}

// ---- Accounts (checking, savings, any you add) ----
// Balances start from what you entered when you set the account up ("start fresh"), then every entry
// logged after that moves money:
//   expense  out of `account` (default checking)        income  into `account` (default checking)
//   saving   `from` (checking) → `to` (savings)          transfer `from` → `to` (not spending or saving)
//   adjust   "Match my bank": a signed correction on `account` (not spending or saving)
export const DEFAULT_ACCOUNTS = [
  { id: 'checking', name: 'Checking', icon: 'bank' },
  { id: 'savings', name: 'Savings', icon: 'piggy' },
];

export function entryMoves(e) {
  switch (e.kind) {
    case 'expense': return [[e.account || 'checking', -e.amount]];
    case 'income': return [[e.account || 'checking', e.amount]];
    case 'saving': return [[e.from || 'checking', -e.amount], [e.to || 'savings', e.amount]];
    case 'transfer': return [[e.from, -e.amount], [e.to, e.amount]];
    case 'adjust': return [[e.account, e.amount]];
    default: return [];
  }
}

// → { accountId: cents }
export function balances(state) {
  const out = {}, since = {};
  for (const a of state.accounts || []) { out[a.id] = a.start || 0; since[a.id] = a.since || ''; }
  for (const e of state.entries || []) {
    for (const [id, d] of entryMoves(e)) if (id in out && (e.at || '') >= since[id]) out[id] += d;
  }
  return out;
}

// Savings are one thing: your Savings account. A "saving" logged before accounts were set up is already
// part of the starting balance, so it doesn't count again (not in totals, not for the paycheck habit).
export function beforeTracking(state, e) {
  const sav = (state.accounts || []).find((a) => a.id === 'savings');
  return !!sav && e.kind === 'saving' && (e.at || '') < (sav.since || '');
}

// How much an account went up or down during a month (only entries logged after it was set up)
export function accountChange(state, id, mk) {
  const a = (state.accounts || []).find((x) => x.id === id);
  if (!a) return 0;
  const [start, end] = monthRange(mk);
  let t = 0;
  for (const e of state.entries || []) {
    if (e.date < start || e.date > end || (e.at || '') < (a.since || '')) continue;
    for (const [aid, d] of entryMoves(e)) if (aid === id) t += d;
  }
  return t;
}

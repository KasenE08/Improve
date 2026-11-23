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

// ---- Paycheck split ----
// split = { rest: accountId, parts: [{ account, mode: 'percent' | 'amount', value }] }
//   value is a percent (0–100) or cents. Parts are taken in order (never more than what's left);
//   whatever remains goes to `rest` (your spending account, Checking by default).
// → [{ account, amount }] adding up to the paycheck
export function splitPaycheck(split, amount) {
  const rest = split?.rest || 'checking';
  const out = [];
  let left = amount;
  for (const p of split?.parts || []) {
    if (!p.value || p.account === rest) continue;
    const want = p.mode === 'percent' ? Math.round((amount * p.value) / 100) : p.value;
    const a = Math.max(0, Math.min(want, left));
    left -= a;
    if (a) out.push({ account: p.account, amount: a });
  }
  if (left > 0 || !out.length) out.push({ account: rest, amount: left });
  return out;
}
// Money a split puts anywhere other than the spending account (what the saving habit checks)
export const setAside = (split, list) => list.filter((x) => x.account !== (split?.rest || 'checking')).reduce((s, x) => s + x.amount, 0);

// ---- Payday (Greenlight): % split with a cap on the spending account ----
// Checking gets the smaller of: what fills it to `cap`, or its % of the paycheck (never below $0).
// Everything left goes to savings and investing in their own ratio (40:20 = 2:1). Amounts are cents;
// investing is rounded and savings takes the leftover cent, so the three always add up to the paycheck.
export const DEFAULT_PAYDAY = { pct: { checking: 40, savings: 40, investing: 20 }, cap: 20000, last: 22200 };
export function paydaySplit(amount, checkingBal, { pct, cap } = DEFAULT_PAYDAY) {
  const want = Math.round((amount * pct.checking) / 100);
  const room = Math.max(0, cap - checkingBal);
  const checking = Math.max(0, Math.min(room, want, amount));
  const left = amount - checking;
  const ratio = pct.savings + pct.investing;
  const investing = ratio > 0 ? Math.round((left * pct.investing) / ratio) : 0;
  return { checking, savings: left - investing, investing };
}
// The account paydays put the investing share in (Settings, or the first account that isn't checking/savings)
export function investingId(state) {
  const accts = state.accounts || [];
  const set = state.settings.payday?.investing;
  if (set && accts.some((a) => a.id === set)) return set;
  return accts.find((a) => a.id !== 'checking' && a.id !== 'savings')?.id || null;
}
// A payday's three amounts as split entries (no investing account yet: that share goes to savings)
export function paydaySplits(state, r) {
  const inv = investingId(state);
  const out = [{ account: 'checking', amount: r.checking }, { account: 'savings', amount: r.savings + (inv ? 0 : r.investing) }];
  if (inv) out.push({ account: inv, amount: r.investing });
  return out.filter((x) => x.amount > 0);
}
export const paydays = (state) => byTime(state.entries).filter((e) => e.kind === 'income' && e.payday);
const shareOf = (e, id) => (e.splits || []).filter((x) => x.account === id).reduce((t, x) => t + x.amount, 0);
/**
 * Running totals: saved / invested all-time (from the balances you started with, plus every payday's share
 * after that) and where each account lands a year from now at the pace of your last 4 paydays.
 * `fallback` (a split preview) sets the pace before the first payday is logged.
 */
export function paydayTotals(state, fallback = null) {
  const inv = investingId(state);
  const base = state.settings.payday?.base || { savings: 0, investing: 0, at: '' };
  const list = paydays(state).filter((e) => (e.at || '') >= (base.at || ''));
  const saved = base.savings + list.reduce((t, e) => t + shareOf(e, 'savings'), 0);
  const invested = base.investing + (inv ? list.reduce((t, e) => t + shareOf(e, inv), 0) : 0);
  const recent = list.slice(-4);
  const avg = (id) => (recent.length ? Math.round(recent.reduce((t, e) => t + shareOf(e, id), 0) / recent.length) : 0);
  const pace = recent.length ? { savings: avg('savings'), investing: inv ? avg(inv) : 0 } : { savings: fallback?.savings || 0, investing: fallback?.investing || 0 };
  const bal = balances(state);
  return {
    saved, invested, paydays: list.length, pace, fromPreview: !recent.length,
    yearSavings: (bal.savings ?? 0) + pace.savings * 52,
    yearInvesting: (inv ? bal[inv] ?? 0 : 0) + pace.investing * 52,
  };
}

export const inRange = (entries, start, end) => entries.filter((e) => e.date >= start && e.date <= end);
export const sum = (list) => list.reduce((s, e) => s + e.amount, 0);

// The "Save from paycheck" check for the Mon–Sun week containing `date`.
//   judge: false until paydays are set up
//   offWeek: no payday expected and no paycheck logged (a week off)
//   required: what this week's paycheck(s) split sets aside (everything not going to the spending account)
//   saved: what was actually set aside: paycheck splits, plus moves out of the spending account
//          (and older "To savings" entries)
//   hit: every expected paycheck is logged and saved ≥ required
export function saveStatus(state, date = appNow()) {
  const { settings, entries } = state;
  const split = settings.split;
  const rest = split?.rest || 'checking';
  const [start, end] = periodRange('weekly', date);
  const expected = paydaysBetween(settings.pay, start, end);
  const week = inRange(entries, start, end);
  const incomes = week.filter((e) => e.kind === 'income');
  let saved = 0;
  for (const e of week) {
    if (e.kind === 'income' && e.splits) saved += setAside(split, e.splits);
    else if (e.kind === 'saving' && !beforeTracking(state, e)) saved += e.amount;
    else if (e.kind === 'transfer' && e.from === rest && e.to !== rest) saved += e.amount;
  }
  const base = { judge: !!settings.setup, start, end, expected, incomes, saved };
  if (!expected.length && !incomes.length) return { ...base, offWeek: true, required: 0, pending: false, hit: true };
  const required = incomes.reduce((s, e) => s + setAside(split, e.payday ? e.splits || [] : splitPaycheck(split, e.amount)), 0);
  const pending = incomes.length < expected.length; // payday came but paycheck not logged yet
  const hit = !pending && incomes.length > 0 && saved >= required;
  return { ...base, offWeek: false, required, pending, hit };
}

// Spending summary for a month: { spent, income, saved, byCat: {catId: cents}, budget }
export function monthSummary(state, mk) {
  const [start, end] = monthRange(mk);
  const list = inRange(state.entries, start, end);
  const byCat = {};
  for (const e of list) if (e.kind === 'expense') byCat[e.cat] = (byCat[e.cat] || 0) + e.amount;
  return {
    spent: sum(list.filter((e) => e.kind === 'expense')) + list.filter((e) => e.kind === 'checkin').reduce((t, e) => t + checkinResult(state, e).spent, 0),
    income: sum(list.filter((e) => e.kind === 'income')),
    saved: sum(list.filter((e) => e.kind === 'saving')),
    byCat,
    budget: (state.categories || []).reduce((s, c) => s + (c.budget || 0), 0),
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
    case 'income': return e.splits ? e.splits.map((x) => [x.account, x.amount]) : [[e.account || 'checking', e.amount]];
    case 'saving': return [[e.from || 'checking', -e.amount], [e.to || 'savings', e.amount]];
    case 'transfer': return [[e.from, -e.amount], [e.to, e.amount]];
    case 'adjust': return [[e.account, e.amount]];
    case 'cashback': return [[e.account || 'savings', e.amount]]; // the card's cash back, deposited by the bank
    default: return [];
  }
}

// Cash back the card pays for a month's logged spending (rate % of it, rounded to the cent)
export const cashbackFor = (state, mk) => Math.round((monthSummary(state, mk).spent * (state.settings.cashback?.rate || 0)) / 100);

// Entries in the order they happened (a check-in sets balances, so order matters)
const byTime = (entries) => [...(entries || [])].sort((a, b) => (a.at || '').localeCompare(b.at || ''));

// → { accountId: cents }. With `before` (an entry), only what happened before that entry.
// A check-in ({ kind: 'checkin', balances: { id: cents } }) sets each account to what the bank showed.
export function balances(state, before = null) {
  const out = {}, since = {};
  for (const a of state.accounts || []) { out[a.id] = a.start || 0; since[a.id] = a.since || ''; }
  for (const e of byTime(state.entries)) {
    if (before && (e === before || (e.id && e.id === before.id))) break;
    if (e.kind === 'checkin') {
      for (const [id, v] of Object.entries(e.balances || {})) if (id in out && (e.at || '') >= since[id]) out[id] = v;
      continue;
    }
    for (const [id, d] of entryMoves(e)) if (id in out && (e.at || '') >= since[id]) out[id] += d;
  }
  return out;
}

/**
 * What a check-in found: the banks' total vs. what Improve expected (start + paychecks, cash back, moves
 * logged since). Less than expected = spent; more = extra money that wasn't logged.
 * `change` = each account since the check-in before it (or since it was set up).
 */
export function checkinResult(state, e) {
  const expected = balances(state, e);
  const ids = Object.keys(e.balances || {}).filter((id) => id in expected);
  const delta = ids.reduce((t, id) => t + (e.balances[id] - expected[id]), 0);
  const list = byTime(state.entries);
  const earlier = list.slice(0, list.findIndex((x) => x === e || (x.id && x.id === e.id))).filter((x) => x.kind === 'checkin');
  const startOf = (id) => [...earlier].reverse().find((x) => id in (x.balances || {}))?.balances[id] ?? (state.accounts || []).find((a) => a.id === id)?.start ?? 0;
  const change = Object.fromEntries(ids.map((id) => [id, e.balances[id] - startOf(id)]));
  if (e.source === 'setup') return { spent: 0, extra: 0, change }; // starting balances, not this week's spending
  return { spent: Math.max(0, -delta), extra: Math.max(0, delta), change };
}
export const checkins = (state) => byTime(state.entries).filter((e) => e.kind === 'checkin');
// The last weekly (Sunday) check-in. Payday, "Update balances" and the starting balances don't count.
export const lastCheckin = (state) => checkins(state).filter((e) => !e.source).pop() || null;
/** Was there a check-in in the Mon–Sun week containing `date`? */
export const checkedInWeek = (state, date = appNow()) => {
  const [start, end] = periodRange('weekly', date);
  return checkins(state).some((e) => !e.source && e.date >= start && e.date <= end);
};
/** What you spent in the Mon–Sun week containing `date`: every check-in that week (Sunday, payday, updates) */
export const weekSpent = (state, date = appNow()) => {
  const [start, end] = periodRange('weekly', date);
  return checkins(state).filter((e) => e.date >= start && e.date <= end).reduce((t, e) => t + checkinResult(state, e).spent, 0);
};

/** Graph: each account's balance over time, one point per check-in (plus its start and today). */
// withNow: false = only real numbers (the starting balance and each check-in), no estimate for today.
export function balanceSeries(state, now = new Date().toISOString(), { withNow = true } = {}) {
  const accts = state.accounts || [];
  const cur = balances(state);
  return accts.map((a) => {
    const pts = [{ at: a.since || now, v: a.start || 0 }];
    // An account left blank in a check-in kept its balance: plot what it had then (so fixing an earlier entry carries through)
    for (const e of checkins(state)) {
      if ((e.at || '') < (a.since || '')) continue;
      pts.push({ at: e.at, v: a.id in (e.balances || {}) ? e.balances[a.id] : balances(state, e)[a.id] });
    }
    if (withNow) pts.push({ at: now, v: cur[a.id] });
    return { id: a.id, name: a.name, points: pts };
  });
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

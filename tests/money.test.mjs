// Run: node tests/money.test.mjs  (paydays, save check, budgets, Money auto-checks)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const L = await import(J('money/logic.js'));
const H = await import(J('habits.js'));
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, '\n  got ', JSON.stringify(a), '\n  want', JSON.stringify(b)); } else console.log('ok', m); };

// ---- amounts ----
eq(L.toCents('40'), 4000, '"40" → 4000 cents');
eq(L.toCents('$1,234.56'), 123456, '"$1,234.56" → cents');
eq(L.toCents('0.1') + L.toCents('0.2'), 30, 'no float drift');
eq(Number.isNaN(L.toCents('abc')), true, 'junk → NaN');
eq(L.fmtMoney(4000), '$40', '$40');
eq(L.fmtMoney(123456), '$1,234.56', '$1,234.56');
eq(L.fmtMoney(-550), '−$5.50', 'negative');

// ---- paydays ----
const bi = { freq: 'biweekly', anchor: '2026-10-23' }; // Fri
eq(L.paydaysBetween(bi, '2026-10-01', '2026-11-30'), ['2026-10-09', '2026-10-23', '2026-11-06', '2026-11-20'], 'every 2 weeks, before and after the anchor');
eq(L.paydaysBetween({ freq: 'weekly', anchor: '2026-10-23' }, '2026-10-19', '2026-11-01'), ['2026-10-23', '2026-10-30'], 'weekly');
eq(L.paydaysBetween({ freq: 'semimonthly', days: [15, 31] }, '2026-02-01', '2026-03-31'), ['2026-02-15', '2026-02-28', '2026-03-15', '2026-03-31'], 'twice a month, 31st clamps to Feb 28');
eq(L.paydaysBetween({ freq: 'monthly', day: 31 }, '2026-11-01', '2027-01-31'), ['2026-11-30', '2026-12-31', '2027-01-31'], 'monthly on the 31st clamps');
eq(L.paydaysBetween({ freq: 'semimonthly', days: [1, 15] }, '2026-12-10', '2027-01-05'), ['2026-12-15', '2027-01-01'], 'twice a month across the new year');
eq(L.paydaysBetween({ freq: 'irregular' }, '2026-10-01', '2026-12-31'), [], 'irregular: none expected');
eq(L.paydaysBetween({ freq: 'biweekly', anchor: null }, '2026-10-01', '2026-12-31'), [], 'no anchor yet: none');
eq(L.nextPayday(bi, '2026-10-24'), '2026-11-06', 'next payday');

// ---- paycheck split ----
const sp85 = { rest: 'checking', parts: [{ account: 'savings', mode: 'percent', value: 85 }] };
eq(L.splitPaycheck(sp85, 12198), [{ account: 'savings', amount: 10368 }, { account: 'checking', amount: 1830 }], '85% of $121.98 → Savings $103.68, rest $18.30');
const sp3 = { rest: 'checking', parts: [{ account: 'savings', mode: 'percent', value: 50 }, { account: 'car', mode: 'amount', value: 2000 }] };
eq(L.splitPaycheck(sp3, 100000), [{ account: 'savings', amount: 50000 }, { account: 'car', amount: 2000 }, { account: 'checking', amount: 48000 }], 'mix % and fixed $');
eq(L.splitPaycheck(sp3, 3000), [{ account: 'savings', amount: 1500 }, { account: 'car', amount: 1500 }], 'fixed $ never takes more than what is left');
eq(L.splitPaycheck({ rest: 'checking', parts: [] }, 5000), [{ account: 'checking', amount: 5000 }], 'no parts: all to the rest account');
eq(L.splitPaycheck({ rest: 'savings', parts: [{ account: 'savings', mode: 'percent', value: 50 }] }, 1000), [{ account: 'savings', amount: 1000 }], 'a part on the rest account is ignored');
eq(L.setAside(sp3, L.splitPaycheck(sp3, 100000)), 52000, 'set aside = everything not going to the rest account');
eq(L.entryMoves({ kind: 'income', amount: 12198, splits: [{ account: 'savings', amount: 10368 }, { account: 'checking', amount: 1830 }] }), [['savings', 10368], ['checking', 1830]], 'a split paycheck deposits into each account');
eq(L.entryMoves({ kind: 'income', amount: 500 }), [['checking', 500]], 'old paychecks without a split go to checking');

// ---- save check (every 2 weeks, anchor Fri Oct 23; split 85% to Savings) ----
const st = (entries, split = sp85, setup = true) => ({
  settings: { pay: bi, split, setup }, entries, categories: [], reviews: {},
});
const payWeek = new Date(2026, 9, 21, 12); // Wed in the week of Oct 19–25 (payday Fri 23)
const offWeek = new Date(2026, 9, 28, 12); // week of Oct 26–Nov 1 (no payday)
const paid = (splits) => ({ kind: 'income', amount: splits.reduce((t, x) => t + x.amount, 0), date: '2026-10-23', splits });
eq(L.saveStatus(st([]), offWeek).offWeek, true, 'no payday: week off');
eq(L.saveStatus(st([]), payWeek).pending, true, 'payday, paycheck not logged yet → pending');
eq(L.saveStatus(st([paid([{ account: 'savings', amount: 42500 }, { account: 'checking', amount: 7500 }])]), payWeek).hit, true, '$500 paycheck split 85% → done');
eq(L.saveStatus(st([paid([{ account: 'savings', amount: 40000 }, { account: 'checking', amount: 10000 }])]), payWeek).hit, false, 'split changed to less than 85% → not done');
eq(L.saveStatus(st([paid([{ account: 'savings', amount: 40000 }, { account: 'checking', amount: 10000 }]), { kind: 'transfer', amount: 2500, from: 'checking', to: 'savings', date: '2026-10-24' }]), payWeek).hit, true, 'make it up with a move from checking that week');
eq(L.saveStatus(st([{ kind: 'income', amount: 50000, date: '2026-10-23' }, { kind: 'saving', amount: 42500, date: '2026-10-23' }]), payWeek).hit, true, 'older "To savings" entries still count');
eq(L.saveStatus(st([{ kind: 'income', amount: 50000, date: '2026-10-16' }]), payWeek).pending, true, 'last week\'s paycheck does not count');
eq(L.saveStatus(st([], undefined, false), payWeek).judge, false, 'not set up: not judged');
const noSplit = { rest: 'checking', parts: [] };
eq(L.saveStatus(st([paid([{ account: 'checking', amount: 50000 }])], noSplit), payWeek).hit, true, 'nothing to set aside: logging the paycheck is enough');
// irregular: a logged paycheck creates the obligation
const irr = { settings: { pay: { freq: 'irregular' }, split: sp85, setup: true }, entries: [{ kind: 'income', amount: 30000, date: '2026-10-28', splits: [{ account: 'checking', amount: 30000 }] }] };
eq(L.saveStatus(irr, offWeek).hit, false, 'irregular: paycheck logged all to checking → not saved');

// ---- month summary ----
const m = L.monthSummary({ categories: [{ id: 'food', budget: 20000 }, { id: 'fun', budget: 5000 }], entries: [
  { kind: 'expense', cat: 'food', amount: 1250, date: '2026-10-02' },
  { kind: 'expense', cat: 'food', amount: 750, date: '2026-10-30' },
  { kind: 'expense', cat: 'fun', amount: 6000, date: '2026-10-15' },
  { kind: 'expense', cat: 'fun', amount: 999, date: '2026-11-01' },
  { kind: 'income', amount: 50000, date: '2026-10-23' },
  { kind: 'saving', amount: 4000, date: '2026-10-23' },
] }, '2026-10');
eq(m, { spent: 8000, income: 50000, saved: 4000, byCat: { food: 2000, fun: 6000 }, budget: 25000 }, 'October summary (November excluded)');
eq(L.shiftMonth('2026-12', 1), '2027-01', 'next month across the year');
eq(L.monthRange('2027-02'), ['2027-02-01', '2027-02-28'], 'month range');


// ---- Accounts: balances start fresh from what you enter, then entries move money ----
{
  const since = '2026-10-27T05:00:00.000Z';
  const after = '2026-10-27T06:00:00.000Z', before = '2026-10-26T20:00:00.000Z';
  const st = {
    accounts: [{ id: 'checking', start: 50000, since }, { id: 'savings', start: 109646, since }],
    entries: [
      { kind: 'expense', amount: 1250, at: before },                       // before setup: ignored (start fresh)
      { kind: 'income', amount: 80000, at: after },                        // paycheck → checking
      { kind: 'expense', amount: 2000, at: after },                        // out of checking
      { kind: 'expense', amount: 500, account: 'savings', at: after },     // paid from savings
      { kind: 'saving', amount: 4000, at: after },                         // checking → savings
      { kind: 'transfer', amount: 10000, from: 'savings', to: 'checking', at: after },
      { kind: 'adjust', account: 'checking', amount: -300, at: after },    // bank fee found via Match
    ],
  };
  eq(L.balances(st), { checking: 50000 + 80000 - 2000 - 4000 + 10000 - 300, savings: 109646 - 500 + 4000 - 10000 }, 'balances: start + every entry after setup');
  eq(L.monthSummary({ ...st, categories: [] , entries: st.entries.map((e) => ({ ...e, date: '2026-10-27' })) }, '2026-10').spent, 1250 + 2000 + 500, 'moves and balance fixes are not spending');
  eq(L.monthSummary({ ...st, categories: [], entries: st.entries.map((e) => ({ ...e, date: '2026-10-27' })) }, '2026-10').saved, 4000, 'moving money out of savings is not negative saving');
  eq(L.balances({ accounts: [], entries: st.entries }), {}, 'no accounts until set up');
  eq(L.balances({ ...st, accounts: [st.accounts[0]] }).checking, 50000 + 80000 - 2000 - 4000 + 10000 - 300, 'entries for a deleted account are skipped');
}

// ---- Savings = the Savings account (one number) ----
{
  const since = '2026-10-27T05:00:00.000Z';
  const st = {
    settings: { setup: true, pay: { freq: 'biweekly', anchor: '2026-10-30' }, split: { rest: 'checking', parts: [{ account: 'savings', mode: 'amount', value: 4000 }] } },
    accounts: [{ id: 'checking', start: 30, since }, { id: 'savings', start: 109646, since }],
    entries: [
      { kind: 'saving', amount: 109546, date: '2026-10-26', at: '2026-10-26T20:00:00.000Z' }, // logged old balance before setup
      { kind: 'income', amount: 50000, date: '2026-10-30', at: '2026-10-30T17:00:00.000Z' },
      { kind: 'saving', amount: 4000, date: '2026-10-30', at: '2026-10-30T18:00:00.000Z' },
      { kind: 'transfer', amount: 1000, from: 'savings', to: 'checking', date: '2026-10-31', at: '2026-10-31T18:00:00.000Z' },
    ],
  };
  eq(L.beforeTracking(st, st.entries[0]), true, 'a saving logged before setup is "before tracking"');
  eq(L.beforeTracking(st, st.entries[1]), false, 'savings after setup count');
  eq(L.balances(st).savings, 109646 + 4000 - 1000, 'Savings balance');
  eq(L.accountChange(st, 'savings', '2026-10'), 4000 - 1000, 'this month: +$40 in, −$10 out = +$30');
  eq(L.accountChange(st, 'savings', '2026-11'), 0, 'nothing in November yet');
  const wk = L.saveStatus(st, new Date(2026, 9, 28, 12));
  eq([wk.saved, wk.hit], [4000, true], 'paycheck habit: only the real $40 counts, not the old balance');
  const noSave = { ...st, entries: [st.entries[0], st.entries[1]] };
  eq(L.saveStatus(noSave, new Date(2026, 9, 28, 12)).hit, false, 'old balance logged as a saving no longer ticks the habit');
}

// ---- auto-checks through storage ----
H.init();
const habits = Object.fromEntries(H.getHabits().map((h) => [h.id, h.auto]));
eq([habits['log-spending'], habits['save-paycheck'], habits['budget-review']], [null, 'money:save', undefined], 'fresh install: save auto, log spending manual, no budget review');
const M = await import(J('money/store.js'));
const A = await import(J('money/autocheck.js'));
const done = (id, key) => !!H.getLog()[key]?.[id];
A.recheckMoney(payWeek, payWeek);
eq(done('save-paycheck', '2026-10-21'), false, 'not set up: save habit untouched');
M.saveSettings({ pay: bi, setup: true });
A.recheckMoney(offWeek, offWeek);
eq([done('save-paycheck', '2026-10-28'), H.isExcused('save-paycheck', '2026-10-26')], [false, true], 'week with no payday: week off (no tick, no XP)');
A.recheckMoney(payWeek, payWeek);
eq(done('save-paycheck', '2026-10-21'), false, 'payday week: not yet');
M.upsertEntry({ kind: 'saving', amount: 4000, date: '2026-10-23', note: '' });
A.recheckMoney(payWeek, payWeek);
eq(done('save-paycheck', '2026-10-21'), false, 'saved $40 but paycheck not logged yet: pending');
eq(M.getState().settings.split, { rest: 'checking', parts: [{ account: 'savings', mode: 'amount', value: 4000 }] }, 'old "save $40 per paycheck" becomes the split');
M.upsertEntry({ kind: 'income', amount: 50000, date: '2026-10-23', note: '' });
A.recheckMoney(payWeek, payWeek);
eq(done('save-paycheck', '2026-10-21'), true, 'paycheck logged + $40 saved: ticked');
{ const _d = new Date(2026, 9, 24, 12); A.recheckMoney(_d, _d); };
eq(Object.keys(H.getLog()).filter((k) => H.getLog()[k]['save-paycheck']).length, 1, 'rechecking later in the week adds no second check-in');
const id = M.getState().entries[0].id;
M.deleteEntry(id);
{ const _d = new Date(2026, 9, 24, 12); A.recheckMoney(_d, _d); };
eq(done('save-paycheck', '2026-10-21'), false, 'deleting the saving unticks the week');
// A saving logged later but dated in an earlier payday week ticks that week
{
  const later = new Date(2026, 10, 2, 12); // the next Monday
  A.recheckMoney(payWeek, later);
  eq(done('save-paycheck', '2026-10-21'), false, 'payday week without saving stays unticked');
  M.upsertEntry({ kind: 'saving', amount: 4000, date: '2026-10-23', note: '' });
  A.recheckMoney(new Date(2026, 9, 23, 12), later);
  eq(Object.keys(H.getLog()).some((k) => k >= '2026-10-19' && k <= '2026-10-25' && H.getLog()[k]['save-paycheck']), true, 'back-dated saving ticks its own week');
}
// Weeks off don't break the saving streak
{
  const R = await import(J('rewards.js'));
  const save = H.getHabits().find((h) => h.id === 'save-paycheck');
  mem.imp_log = '{}'; mem.imp_excused = '{}';
  H.setPeriodDone(save, new Date(2026, 10, 4, 12), true, new Date(2026, 10, 4, 12)); // payday week Nov 2
  H.setExcused(save, '2026-11-09', true);                                            // no payday Nov 9
  H.setPeriodDone(save, new Date(2026, 10, 18, 12), true, new Date(2026, 10, 18, 12)); // payday week Nov 16
  eq(R.streak(save, new Date(2026, 10, 18, 12)).count, 2, 'saving streak skips the week off (2 payday weeks)');
  eq(R.streak(save, new Date(2026, 10, 25, 12)), { count: 2, current: false }, 'next week not done yet: streak alive');
}
eq(Object.keys(mem).every((k) => k.startsWith('imp_')), true, 'only imp_ keys');

// ---- upgrade from schema 2 keeps habits, sets the Money autos ----
for (const k of Object.keys(mem)) delete mem[k];
mem.imp_schema = '2';
mem.imp_habits = JSON.stringify([{ id: 'log-spending', auto: 'money:log', xp: 5 }, { id: 'save-paycheck', auto: null, xp: 25, name: 'My save' }, { id: 'budget-review', auto: null }, { id: 'kept-word', auto: null }]);
H.init();
eq(JSON.parse(mem.imp_habits).filter((h) => h.id !== 'proactive').map((h) => [h.id, h.auto]), [['log-spending', null], ['save-paycheck', 'money:save'], ['budget-review', 'money:review'], ['kept-word', null]], 'upgrade sets autos, keeps the rest');
eq(JSON.parse(mem.imp_habits).find((h) => h.id === 'budget-review').archived, true, 'schema 14: Budget review put away (kept, hidden)');
eq(JSON.parse(mem.imp_habits)[1].name, 'My save', 'upgrade keeps edits');

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;

// ---- Budget review habit follows the Monday-month; budgets stay calendar months ----
{
  const st = (doneAt) => ({ reviews: { '2026-11': { doneAt } } });
  eq(L.reviewDone(st(new Date(2026, 11, 3, 20).toISOString()), new Date(2026, 10, 20, 12)), true, 'review on Dec 3 counts for the Nov habit month (Nov 2 – Dec 6)');
  eq(L.reviewDone(st(new Date(2026, 11, 3, 20).toISOString()), new Date(2026, 11, 8, 12)), false, 'but not for December (Dec 7 – Jan 3)');
  eq(L.reviewDone(st(new Date(2026, 11, 7, 2).toISOString()), new Date(2026, 11, 6, 12)), true, 'Mon Dec 7 at 2 AM still counts for November');
  eq(L.monthRange('2026-11'), ['2026-11-01', '2026-11-30'], 'budget month stays Nov 1–30');
  eq(L.reviewMonth(new Date(2026, 11, 1, 12)), '2026-11', 'Tue Dec 1: panel shows the November review');
  eq(L.reviewMonth(new Date(2026, 11, 7, 12)), '2026-12', 'Mon Dec 7: December review');
  eq(L.reviewMonth(new Date(2027, 0, 2, 12)), '2026-12', 'Sat Jan 2: still the December review');
  eq(L.reviewMonth(new Date(2026, 10, 2, 12)), '2026-11', 'Mon Nov 2: November review');
}

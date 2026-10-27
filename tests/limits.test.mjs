// Run: node tests/limits.test.mjs  (limit habits: "at most N times", XP when the period ends)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const H = await import(J('habits.js'));
const R = await import(J('rewards.js'));
const S = await import(J('stats.js'));
const { appNow } = await import(J('dates.js'));
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, '\n  got ', JSON.stringify(a), '\n  want', JSON.stringify(b)); } else console.log('ok', m); };
const at = (m, d, h = 12) => new Date(2026, m, d, h); // month is 0-based
const reset = (habits) => {
  for (const k of Object.keys(mem)) delete mem[k];
  mem.imp_schema = String(H.SCHEMA);
  mem.imp_categories = JSON.stringify([{ id: 'diet', name: 'Diet', icon: 'diet' }, { id: 'body', name: 'Body', icon: 'body' }]);
  mem.imp_habits = JSON.stringify(habits);
  mem.imp_log = '{}'; mem.imp_bonus = '{}';
};
const fast = { id: 'fast', name: 'Fast food', category: 'diet', frequency: 'weekly', target: 2, xp: 25, order: 0, archived: false, auto: null, kind: 'limit', limitSince: '2026-10-26' };
const sleep = { id: 'sleep', name: 'Sleep', category: 'body', frequency: 'daily', target: 1, xp: 20, order: 1, archived: false, auto: null };
const get = (id) => H.getHabits().find((h) => h.id === id);
const limitBonus = (day, id = 'fast') => R.getBonus()[day]?.['limit:' + id];

// ---- Taps count uses, never XP ----
reset([fast]);
eq(H.step(get('fast'), 1, at(9, 27)), 0, 'tap returns no XP');
H.step(get('fast'), 1, at(9, 29));
eq(H.progress(get('fast'), at(9, 30)), 2, '2 uses this week');
eq(S.compute().total, 0, 'uses give no XP');
eq(S.compute().checkins, 0, 'uses are not check-ins');
eq(H.isDone(get('fast'), 2), true, 'at the limit = on track');
eq(H.isDone(get('fast'), 3), false, 'over = not on track');
for (let i = 0; i < 120; i++) H.step(get('fast'), 1, at(9, 30));
eq(H.progress(get('fast'), at(9, 30)), H.LIMIT_MAX_USES, 'uses capped at 99');
reset([fast]);
H.step(get('fast'), 1, at(9, 27)); H.step(get('fast'), 1, at(9, 29));

// ---- Settles only once the week is over ----
eq(R.sync(at(10, 1, 23)), [], 'Sun Nov 1 11 PM: week not over, nothing yet');
eq(R.sync(appNow(new Date(2026, 10, 2, 3))).length, 0, 'Mon 3 AM: still Sunday (day ends 4 AM)');
let added = R.sync(at(10, 2, 9));
eq(added.map((b) => [b.type, b.xp, b.n, b.max]), [['limit', 25, 2, 2]], 'Mon 9 AM: week at 2/2 → +25 XP');
eq(!!limitBonus('2026-11-01'), true, 'credited to Sunday Nov 1');
eq(S.compute().total, 25, 'XP counts in the total');
eq(S.compute().categories.find((c) => c.id === 'diet').xp, 25, 'and in its category');
eq(R.sync(at(10, 3)).length, 0, 'judged once, no repeat');

// ---- Going over: no XP, no penalty ----
for (const d of [3, 4, 5]) H.step(get('fast'), 1, at(10, d));
eq(R.sync(at(10, 9)).length, 0, 'week of Nov 2 at 3/2 → no XP');
eq(!!limitBonus('2026-11-08'), false, 'no bonus for the over week');
eq(S.compute().total, 25, 'earlier XP kept (no penalty)');
// undo one use after the week was judged doesn't re-open it
H.step(get('fast'), -1, at(10, 9)); // this week has none → nothing changes
eq(R.sync(at(10, 10)).length, 0, 'past weeks are not re-judged');

// ---- 0 uses, and weeks skipped while the app was closed ----
added = R.sync(at(10, 30));
eq(added.map((b) => b.type), ['limit', 'limit', 'limit'], 'app closed 3 weeks: every clean week paid on next open');
eq([!!limitBonus('2026-11-15'), !!limitBonus('2026-11-22'), !!limitBonus('2026-11-29')], [true, true, true], 'credited to each Sunday');

// ---- Streak of weeks under the limit + milestone ----
eq(R.streak(get('fast'), at(10, 30)).count, 3, 'streak = 3 weeks (Nov 9–29; Nov 2 week was over)');
for (let w = 0; w < 5; w++) R.sync(at(11, 7 + w * 7));
const b7 = Object.entries(R.getBonus()).find(([, v]) => v['streak:fast']);
eq(b7 && [b7[0], b7[1]['streak:fast'].n, b7[1]['streak:fast'].xp], ['2026-12-27', 7, 50], '7th clean week → +50 milestone on that Sunday');
eq(R.allStreaks(at(11, 30)).find((s) => s.h.id === 'fast').count, 7, 'profile streak list shows it');

// ---- Not before launch / before it became a limit ----
reset([{ ...fast, limitSince: '2026-11-11' }]);
eq(Object.keys(R.getBonus()).length, 0, '');
eq(R.sync(at(10, 30)).map((b) => b.n), [0, 0, 0], 'limit since Wed Nov 11: weeks of Nov 9, 16, 23 judged, not earlier');
eq(!!limitBonus('2026-11-08'), false, 'week before it became a limit not paid');
reset([{ ...fast, limitSince: '2026-09-01' }]);
eq(R.sync(at(9, 27)).length, 0, 'nothing judged before launch (Oct 26)');
eq(R.sync(at(10, 2)).length, 1, 'first judged week is launch week');

// ---- Limit of 0 ----
reset([{ ...fast, target: 0 }]);
eq(R.sync(at(10, 2)).length, 1, 'limit 0 with no uses → XP');
reset([{ ...fast, target: 0 }]);
H.step(get('fast'), 1, at(9, 28));
eq(R.sync(at(10, 2)).length, 0, 'limit 0 with 1 use → no XP');

// ---- Monthly limits wait for the first full habit month ----
reset([{ ...fast, frequency: 'monthly', limitSince: '2026-10-26' }]);
eq(H.step(get('fast'), 1, at(9, 28)), 0, 'monthly limit can\'t be tapped before Nov 2');
eq(H.progress(get('fast'), at(9, 28)), 0, 'no use logged');
eq(R.sync(at(11, 6)).length, 0, 'Nov habit month (Nov 2 – Dec 6) not over on Dec 6');
eq(R.sync(at(11, 7)).map((b) => [b.type, b.unit]), [['limit', 'month']], 'paid Mon Dec 7, credited to Dec 6');
eq(!!limitBonus('2026-12-06'), true, 'on the month\'s last day');

// ---- Daily limits + Perfect Day ----
const soda = { ...fast, id: 'soda', name: 'Soda', frequency: 'daily', target: 1, xp: 10, limitSince: '2026-11-03' };
reset([sleep, soda]);
H.step(get('sleep'), 1, at(10, 3));
eq(R.sync(at(10, 3)).map((b) => b.type), ['perfect'], 'daily limit at 0/1 counts toward Perfect Day');
H.step(get('soda'), 1, at(10, 3));
R.sync(at(10, 3));
eq(!!R.getBonus()['2026-11-03']?.perfect, true, '1/1 still on track');
H.step(get('soda'), 1, at(10, 3));
R.sync(at(10, 3));
eq(!!R.getBonus()['2026-11-03']?.perfect, false, '2/1 over → Perfect Day removed');
H.step(get('soda'), -1, at(10, 3));
R.sync(at(10, 3));
eq(!!R.getBonus()['2026-11-03']?.perfect, true, 'undo the extra → Perfect Day back');
eq(S.today(at(10, 3)).max, 20 + 100, 'today meter leaves daily limits out (paid after the day)');
added = R.sync(at(10, 4));
eq(added.filter((b) => b.type === 'limit').map((b) => [b.n, b.max]), [[1, 1]], 'next morning: yesterday 1/1 → +10');
eq(!!limitBonus('2026-11-03', 'soda'), true, 'credited to yesterday');

// ---- Weekly potential: a limit pays once per period ----
reset([fast, sleep]);
eq(S.weeklyPotential().byCat.diet, 25, 'limit counts its XP once a week, not × max');

// ---- Turning a goal habit into a limit ----
reset([{ ...fast, kind: undefined, limitSince: undefined }]);
H.step(get('fast'), 1, at(10, 3)); H.step(get('fast'), 1, at(10, 4));
eq(S.compute().total, 50, 'as a goal, taps gave XP');
H.upsertHabit({ id: 'fast', kind: 'limit', limitSince: '2026-11-04' });
H.clearPeriodXP(get('fast'), at(10, 4));
eq([S.compute().total, H.progress(get('fast'), at(10, 4))], [0, 2], 'switching to a limit: this week\'s taps become uses (no XP)');

eq(Object.keys(mem).every((k) => k.startsWith('imp_')), true, 'only imp_ keys');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;

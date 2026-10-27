// Run: node tests/logic.test.mjs  (checks period resets, caps, undo, key prefix)
const mem = {}; globalThis.localStorage = { getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => delete mem[k] };
const R = new URL('../js/', import.meta.url).href;
const D = await import(R + 'dates.js'); const H = await import(R + 'habits.js');
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, a, b); process.exitCode = 1; } else console.log('ok', m); };
eq(D.periodRange('weekly', new Date(2026, 9, 24)), ['2026-10-19', '2026-10-25'], 'week of Sat Oct 24 = Mon 19..Sun 25');
eq(D.periodRange('weekly', new Date(2026, 9, 26)), ['2026-10-26', '2026-11-01'], 'Monday starts new week');
eq(D.periodRange('weekly', new Date(2026, 10, 1)), ['2026-10-26', '2026-11-01'], 'Sunday belongs to prior Monday');
eq(D.periodRange('monthly', new Date(2026, 9, 31, 23, 59)), ['2026-10-05', '2026-11-01'], 'habit month: first Monday (Oct 5) → day before next first Monday (Nov 1)');
eq(D.periodRange('monthly', new Date(2026, 10, 2, 12)), ['2026-11-02', '2026-12-06'], 'November starts Mon Nov 2, runs 5 weeks');
eq(D.periodRange('monthly', new Date(2028, 1, 10)), ['2028-02-07', '2028-03-05'], 'Feb 2028: Feb 7 – Mar 5');
eq(D.periodRange('monthly', new Date(2027, 1, 10)), ['2027-02-01', '2027-02-28'], 'Feb 2027: Feb 1 is a Monday, Mar 1 too');
eq(D.dayKey(new Date(2026, 9, 24, 23, 59)), '2026-10-24', 'day key before midnight');
eq(D.dayKey(new Date(2026, 9, 25, 0, 0)), '2026-10-25', 'day key after midnight');
H.init();
const lift = H.getHabits().find(h => h.id === 'lift'), sleep = H.getHabits().find(h => h.id === 'sleep'), cut = H.getHabits().find(h => h.id === 'haircut');
eq(H.getHabits().length, 34, '34 preloaded habits');
const sat = new Date(2026, 9, 24, 10), sun = new Date(2026, 9, 25, 10), mon = new Date(2026, 9, 26, 10);
H.step(sleep, 1, sat); eq(H.progress(sleep, sat), 1, 'sleep done Sat');
eq(H.progress(sleep, sun), 0, 'daily resets Sun');
for (let i = 0; i < 6; i++) H.step(lift, 1, i < 3 ? sat : sun);
eq(H.progress(lift, sun), 5, 'lift capped at 5/week');
eq(H.progress(lift, mon), 0, 'weekly resets Monday');
eq(H.step(cut, 1, new Date(2026, 9, 30, 12)), 0, 'monthly habits locked before the first full habit month (Nov 2)');
H.step(cut, 1, new Date(2026, 11, 8, 12)); eq(H.progress(cut, new Date(2026, 11, 20, 12)), 1, 'monthly counts across month');
eq(H.progress(cut, new Date(2027, 0, 3, 12)), 1, 'Sun Jan 3 is still the December habit month');
eq(H.progress(cut, new Date(2027, 0, 4, 12)), 0, 'monthly resets on the first Monday');
eq(H.setDone({ ...cut, auto: 'x' }, '2026-10-30', true, new Date(2026, 9, 30, 12)), false, 'auto ticks blocked for monthly before Nov 2 too');
eq(H.xpOnDay('2026-10-24'), 20 + 60, 'XP Sat = sleep 20 + 3 lifts');
H.step(lift, -1, mon); eq(H.progress(lift, sun), 5, 'undo Monday cannot touch last week');
H.step(lift, -1, sun); eq(H.progress(lift, sun), 4, 'undo on Sun removes one');
eq(JSON.parse(mem.imp_log)['2026-10-25'].lift.n, 1, 'undo took Sunday entry first');
eq(Object.keys(mem).every(k => k.startsWith('imp_')), true, 'all keys imp_');

// ---- 4 AM day end (late-night check-ins count for the day you're finishing) ----
eq(D.dayKey(D.appNow(new Date(2026, 9, 25, 23, 59))), '2026-10-25', 'Sun 11:59 PM is Sunday');
eq(D.dayKey(D.appNow(new Date(2026, 9, 26, 0, 30))), '2026-10-25', 'Mon 12:30 AM still counts as Sunday');
eq(D.dayKey(D.appNow(new Date(2026, 9, 26, 4, 0))), '2026-10-25', 'Mon 4:00 AM still Sunday');
eq(D.dayKey(D.appNow(new Date(2026, 9, 26, 4, 1))), '2026-10-26', 'Mon 4:01 AM is Monday');
eq(D.periodRange('weekly', D.appNow(new Date(2026, 9, 26, 1, 0))), ['2026-10-19', '2026-10-25'], 'Mon 1 AM: still last week');
eq(D.periodRange('monthly', D.appNow(new Date(2026, 10, 2, 2, 0))), ['2026-10-05', '2026-11-01'], 'Mon Nov 2, 2 AM: still October month');
eq(D.periodRange('monthly', D.appNow(new Date(2026, 10, 2, 4, 1))), ['2026-11-02', '2026-12-06'], 'Mon Nov 2, 4:01 AM: November month');
{
  const lift = H.getHabits().find((h) => h.id === 'lift');
  const before = H.progress(lift, new Date(2026, 9, 25, 12));
  H.step(lift, 1, D.appNow(new Date(2026, 9, 26, 1, 0)));
  eq(H.progress(lift, new Date(2026, 9, 25, 12)), Math.min(before + 1, lift.target), 'tick at Mon 1 AM lands in last week');
}
eq(D.dayKey(D.nextStart('weekly', new Date(2026, 9, 25, 12))), '2026-10-26', 'next week starts Monday Oct 26');
eq(D.dayKey(D.nextStart('weekly', new Date(2026, 9, 26, 12))), '2026-11-02', 'from Monday: next is Nov 2');
eq(D.dayKey(D.nextStart('monthly', new Date(2026, 11, 15, 12))), '2027-01-04', 'next month starts Mon Jan 4');

// ---- Upgrade to schema 6 adds "Be proactive" right after "Kept my word", same worth ----
for (const k of Object.keys(mem)) delete mem[k];
mem.imp_schema = '5';
mem.imp_habits = JSON.stringify([
  { id: 'journal', name: 'Journal', category: 'mind', frequency: 'daily', target: 1, xp: 10, order: 0 },
  { id: 'kept-word', name: 'Kept my word', category: 'mind', frequency: 'daily', target: 1, xp: 15, order: 1 },
  { id: 'fast-food', name: 'Fast food', category: 'diet', frequency: 'weekly', target: 2, xp: 25, order: 2 },
]);
mem.imp_log = '{"2026-11-03":{"kept-word":{"n":1,"xp":15}}}';
H.init();
const up = H.getHabits();
eq(up.map((h) => h.id), ['journal', 'kept-word', 'proactive', 'fast-food'], 'upgrade: Be proactive sits right after Kept my word');
const pro = up.find((h) => h.id === 'proactive');
eq([pro.name, pro.category, pro.frequency, pro.target, pro.xp, pro.auto], ['Be proactive', 'mind', 'daily', 1, 15, null], 'upgrade: same category + XP as Kept my word (edited to 15)');
eq(mem.imp_log, '{"2026-11-03":{"kept-word":{"n":1,"xp":15}}}', 'upgrade: history untouched');
H.init();
eq(H.getHabits().filter((h) => h.id === 'proactive').length, 1, 'upgrade runs once');

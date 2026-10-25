// Run: node tests/logic.test.mjs  (checks period resets, caps, undo, key prefix)
const mem = {}; globalThis.localStorage = { getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => delete mem[k] };
const R = new URL('../js/', import.meta.url).href;
const D = await import(R + 'dates.js'); const H = await import(R + 'habits.js');
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, a, b); process.exitCode = 1; } else console.log('ok', m); };
eq(D.periodRange('weekly', new Date(2026, 9, 24)), ['2026-10-19', '2026-10-25'], 'week of Sat Oct 24 = Mon 19..Sun 25');
eq(D.periodRange('weekly', new Date(2026, 9, 26)), ['2026-10-26', '2026-11-01'], 'Monday starts new week');
eq(D.periodRange('weekly', new Date(2026, 10, 1)), ['2026-10-26', '2026-11-01'], 'Sunday belongs to prior Monday');
eq(D.periodRange('monthly', new Date(2026, 9, 31, 23, 59)), ['2026-10-01', '2026-10-31'], 'Oct 31 late night still October');
eq(D.periodRange('monthly', new Date(2026, 10, 1, 0, 1)), ['2026-11-01', '2026-11-30'], 'Nov 1 new month');
eq(D.periodRange('monthly', new Date(2028, 1, 10)), ['2028-02-01', '2028-02-29'], 'leap Feb');
eq(D.dayKey(new Date(2026, 9, 24, 23, 59)), '2026-10-24', 'day key before midnight');
eq(D.dayKey(new Date(2026, 9, 25, 0, 0)), '2026-10-25', 'day key after midnight');
H.init();
const lift = H.getHabits().find(h => h.id === 'lift'), sleep = H.getHabits().find(h => h.id === 'sleep'), cut = H.getHabits().find(h => h.id === 'haircut');
eq(H.getHabits().length, 33, '33 preloaded habits');
const sat = new Date(2026, 9, 24, 10), sun = new Date(2026, 9, 25, 10), mon = new Date(2026, 9, 26, 10);
H.step(sleep, 1, sat); eq(H.progress(sleep, sat), 1, 'sleep done Sat');
eq(H.progress(sleep, sun), 0, 'daily resets Sun');
for (let i = 0; i < 6; i++) H.step(lift, 1, i < 3 ? sat : sun);
eq(H.progress(lift, sun), 5, 'lift capped at 5/week');
eq(H.progress(lift, mon), 0, 'weekly resets Monday');
H.step(cut, 1, new Date(2026, 9, 3)); eq(H.progress(cut, sat), 1, 'monthly counts across month');
eq(H.progress(cut, new Date(2026, 10, 1)), 0, 'monthly resets on 1st');
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
eq(D.periodRange('monthly', D.appNow(new Date(2026, 10, 1, 2, 0))), ['2026-10-01', '2026-10-31'], 'Nov 1, 2 AM: still October');
eq(D.periodRange('monthly', D.appNow(new Date(2026, 10, 1, 4, 1))), ['2026-11-01', '2026-11-30'], 'Nov 1, 4:01 AM: November');
{
  const lift = H.getHabits().find((h) => h.id === 'lift');
  const before = H.progress(lift, new Date(2026, 9, 25, 12));
  H.step(lift, 1, D.appNow(new Date(2026, 9, 26, 1, 0)));
  eq(H.progress(lift, new Date(2026, 9, 25, 12)), Math.min(before + 1, lift.target), 'tick at Mon 1 AM lands in last week');
}

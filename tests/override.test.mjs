// Run: node tests/override.test.mjs  (tick an auto habit yourself: sticks, full XP, beats day off, undo hands it back)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const H = await import(J('habits.js'));
H.init();
// The planner rule is off since schema 12 ("Finished today's work" is ticked by hand); these tests turn it on to check it
const __hs = JSON.parse(mem.imp_habits); for (const h of __hs) if (h.id === 'work-on-schedule') Object.assign(h, { auto: 'planner:work', autoAfter: 900 }); mem.imp_habits = JSON.stringify(__hs);
const P = await import(J('planner-auto.js'));
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, a, b); } else console.log('ok', m); };

const work = H.getHabits().find((h) => h.id === 'work-on-schedule');
const save = H.getHabits().find((h) => h.auto === 'money:save');
const D = '2026-10-29';
const noon = new Date(2026, 9, 29, 12); // before the 3 PM auto time
const late = new Date(2026, 9, 29, 16);
const entry = () => H.getLog()[D]?.[work.id];
const plan = (d) => { mem.imp_planner = JSON.stringify(d); };
const t = (h) => new Date(2026, 9, 29, h).getTime();

// Nothing planned: day off
plan({ tasks: [], blocks: [{ id: 'school' }], plan: { items: [] } });
P.recheckPlanner(late);
eq([!!entry(), H.isExcused(work.id, D)], [false, true], 'nothing planned: day off');

// Override beats the day off, gives full XP, before 3 PM too
H.setOverride(work, true, noon);
eq([entry()?.n, entry()?.xp, H.isExcused(work.id, D), H.isOverridden(work, noon)], [1, work.xp, false, true], 'override: ticked, full XP, not a day off');
P.recheckPlanner(late);
eq([!!entry(), H.isExcused(work.id, D)], [true, false], 'auto check cannot undo it or turn it back into a day off');

// Unfinished tasks don't take it back either
plan({ tasks: [{ id: 'a', status: 'todo' }], plan: { items: [{ taskId: 'a', start: t(13), end: t(14) }] } });
P.recheckPlanner(late);
eq(!!entry(), true, 'unfinished task: override still stands');

// Undo: tick removed, auto decides again
H.setOverride(work, false, noon);
P.recheckPlanner(late);
eq([!!entry(), H.isOverridden(work, noon)], [false, false], 'back to auto: unfinished task = not done');
plan({ tasks: [{ id: 'a', status: 'done', startedAt: t(13), completedAt: t(14) }], plan: { items: [{ taskId: 'a', start: t(13), end: t(14) }] } });
P.recheckPlanner(late);
eq(!!entry(), true, 'back to auto: finished task ticks it again');

// Next day it's auto again
H.setOverride(work, true, noon);
eq(H.isOverridden(work, new Date(2026, 9, 30, 12)), false, 'override lasts only for its own day');

// Weekly auto habit: one tick for the week, period-done can't remove it
const wk = new Date(2026, 9, 28, 12); // Wed
H.setOverride(save, true, wk);
const weekTicks = () => Object.values(H.getLog()).reduce((n, d) => n + (d[save.id]?.n || 0), 0);
eq(weekTicks(), 1, 'weekly override: one tick');
eq(H.setPeriodDone(save, new Date(2026, 9, 30, 12), false), false, 'weekly auto check leaves it alone later in the week');
eq(H.setExcused(save, '2026-10-26', true), false, 'weekly override beats a week off');
eq(weekTicks(), 1, 'still ticked');
H.setOverride(save, false, wk);
eq(weekTicks(), 0, 'weekly undo clears it');

if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('all passed');

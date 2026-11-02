// Run: node tests/override.test.mjs  (tick an auto habit yourself: sticks, full XP, beats day off, undo hands it back)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const H = await import(J('habits.js'));
H.init();
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, a, b); } else console.log('ok', m); };

// A daily auto habit ("100 oz water"); the auto check is played by hand here: day off / done / not done
const work = H.getHabits().find((h) => h.auto === 'food:water');
const save = H.getHabits().find((h) => h.auto === 'money:save');
const D = '2026-10-29';
const noon = new Date(2026, 9, 29, 12);
const late = new Date(2026, 9, 29, 16);
const entry = () => H.getLog()[D]?.[work.id];
const auto = (state) => { // what an auto check would do
  if (state === 'off') H.setExcused(work, D, true);
  else H.setPeriodDone(work, late, state === 'done', late);
};

auto('off');
eq([!!entry(), H.isExcused(work.id, D)], [false, true], 'auto: day off');

// Override beats the day off, gives full XP
H.setOverride(work, true, noon);
eq([!!entry(), entry()?.xp, H.isExcused(work.id, D), H.isOverridden(work, noon)], [true, work.xp, false, true], 'override: ticked, full XP, not a day off');
auto('off'); auto('not');
eq([!!entry(), H.isExcused(work.id, D)], [true, false], 'auto check cannot undo it or turn it back into a day off');

// Undo: tick removed, auto decides again
H.setOverride(work, false, noon);
auto('not');
eq([!!entry(), H.isOverridden(work, noon)], [false, false], 'back to auto: not done');
auto('done');
eq(!!entry(), true, 'back to auto: done ticks it again');

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

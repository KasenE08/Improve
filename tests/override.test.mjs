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
const D = '2026-10-29';
const noon = new Date(2026, 9, 29, 12);
const late = new Date(2026, 9, 29, 16);
const entry = () => H.getLog()[D]?.[work.id];
const auto = (state) => { // what an auto check would do
  if (state === 'off') H.setExcused(work, D, true);
  else H.setDone(work, D, state === 'done', late);
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

// Ticked by hand as 2-min: the auto check leaves that alone too; back to auto clears it
{
  const d2 = new Date(2026, 9, 31, 12);
  H.setOverride(work, true, d2, H.MIN);
  eq(H.levelOn(work, '2026-10-31'), H.MIN, 'override at 2-min');
  eq(H.setDone(work, '2026-10-31', H.FULL, d2), false, 'auto check leaves a 2-min override alone');
  H.setOverride(work, false, d2);
  eq(H.levelOn(work, '2026-10-31'), 0, 'back to auto clears it');
  eq(H.setDone(work, '2026-10-31', H.MIN, d2), true, 'auto can set 2-min');
  eq(H.levelOn(work, '2026-10-31'), H.MIN, '… and it shows as 2-min');
}

if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('all passed');

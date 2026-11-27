// Run: node tests/retire.test.mjs  (Nov 27, 2026: Habits retired; fast food moves to the Food tab)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const H = await import(J('habits.js'));
const R = await import(J('rewards.js'));
const { retireHabits } = await import(J('retire.js'));
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, '\n  got ', JSON.stringify(a), '\n  want', JSON.stringify(b)); } else console.log('ok', m); };

H.init();
const ff = H.getHabits().find((h) => H.isFastFood(h));
H.step(ff, 1, new Date(2026, 10, 23, 12)); H.step(ff, 1, new Date(2026, 10, 25, 12)); H.step(ff, 1, new Date(2026, 10, 25, 13));
H.setLevel(H.getHabits().find((h) => h.id === 'sleep'), '2026-11-25', H.FULL);
const logBefore = mem.imp_log;
eq(retireHabits(), true, 'retires once');
eq(H.getHabits().length, 0, 'no habits left on the list');
eq(H.getAllHabits().every((h) => h.archived && h.retired), true, 'all put away and marked retired (kept in storage)');
eq(mem.imp_log, logBefore, 'habit history untouched');
eq(JSON.parse(mem.imp_food).fastFood, { '2026-11-23': 1, '2026-11-25': 2 }, 'fast food meals moved to the Food tab');
eq(retireHabits(), false, 'runs only once');
eq(R.sync(new Date(2026, 10, 25, 20)).length, 0, 'nothing to celebrate (no Perfect Days, no streaks)');

// Food tab: fast food this week
const F = await import(J('food/store.js'));
F.reload();
eq(F.fastFoodWeek('2026-11-26'), 3, 'this week (Mon Nov 23–Sun 29): 3 meals');
F.addFastFood('2026-11-27', 1);
eq([F.fastFoodOn('2026-11-27'), F.fastFoodWeek('2026-11-29')], [1, 4], 'log one more on Fri');
F.removeFastFood('2026-11-28');
eq([F.fastFoodOn('2026-11-27'), F.fastFoodWeek('2026-11-29')], [0, 3], 'remove takes the latest one this week');
eq(F.fastFoodWeek('2026-11-30'), 0, 'next week starts at 0');
eq(F.getGoals().fastFoodMax, 2, 'max 2 a week');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exitCode = fails ? 1 : 0;

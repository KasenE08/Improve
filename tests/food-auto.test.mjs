// Run: node tests/food-auto.test.mjs  (food log → Hit calories / Hit protein habits)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => delete mem[k],
  key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; },
};
const J = (p) => new URL('../js/' + p, import.meta.url).href;
const H = await import(J('habits.js'));
H.init();
const F = await import(J('food/store.js'));
const A = await import(J('food/autocheck.js'));
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, a, b); } else console.log('ok', m); };
const day = '2026-10-24';
const done = (id) => !!H.getLog()[day]?.[id];

const lv = (id, d = day) => H.levelOn({ id }, d); // 0 not yet, 1 = 2-min, 2 = Full

eq(F.getGoals(), { calGoal: 2200, proteinGoal: 130, proteinMin: 115, calRange: 10, calMax: 2700, waterGoal: 100, waterMin: 80 }, 'default goals: 2200 cal ±10% (2-min ≤ 2700), protein 130 g (2-min 115), water 100 oz (2-min 80)');
F.quickAdd({ date: day, meal: 'lunch', label: 'A', cal: 1000, protein: 114 });
A.recheck(day);
eq([lv('calories'), lv('protein')], [1, 0], '1000 cal / 114 g: calories 2-min (under 2700), protein not yet');
const e = F.quickAdd({ date: day, meal: 'dinner', label: 'B', cal: 1100, protein: 1 });
A.recheck(day);
eq([lv('calories'), lv('protein')], [2, 1], '2100 cal / 115 g: calories Full, protein 2-min');
eq(H.getLog()[day].calories.xp, 60, 'Full carries the habit XP');
F.updateEntry(e.id, { cal: 1600, protein: 16 });
A.recheck(day);
eq([lv('calories'), lv('protein')], [1, 2], '2600 cal (over the range, under 2700) = 2-min; 130 g protein = Full');
F.updateEntry(e.id, { cal: 1800 });
A.recheck(day);
eq(lv('calories'), 0, '2800 cal: over 2700, not done');
F.saveGoals({ calRange: 30 });
A.recheck(day);
eq(lv('calories'), 2, 'wider range ±30% (max 2860): Full again');
F.saveGoals({ calRange: 10 });
F.deleteEntry(e.id);
A.recheck(day);
eq([lv('calories'), lv('protein')], [1, 0], 'delete entry: back to 1000 cal / 114 g');
// Water: 2-min at 80 oz, Full at 100 oz (per food day)
{
  const wday = '2026-10-25';
  eq(H.getHabits().find((h) => h.id === 'water').auto, 'food:water', 'water habit is auto from the Food tab');
  F.addWater(wday, 64); A.recheck(wday);
  eq([F.waterFor(wday), lv('water', wday)], [64, 0], '64 oz: not yet');
  F.addWater(wday, 16); A.recheck(wday);
  eq(lv('water', wday), 1, '80 oz: 2-min');
  F.addWater(wday, 20); A.recheck(wday);
  eq(lv('water', wday), 2, '100 oz: Full');
  F.addWater(wday, -8); A.recheck(wday);
  eq(lv('water', wday), 1, 'remove 8 oz: back to 2-min');
  F.addWater(wday, -500);
  eq(F.waterFor(wday), 0, 'water never goes below 0');
  A.recheck(wday);
  eq(lv('water', wday), 0, 'nothing: not done');
}

// Food logged ahead on a future day ticks nothing until that day comes
{
  const future = '2099-01-05';
  F.quickAdd({ date: future, meal: 'lunch', label: 'Prep', cal: 2200, protein: 150 });
  A.recheck(future);
  eq(!!H.getLog()[future], false, 'future day: no ticks or XP yet');
}
eq(Object.keys(mem).every((k) => k.startsWith('imp_')), true, 'only imp_ keys written');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;

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

eq(F.getGoals(), { calGoal: 2600, proteinGoal: 150, proteinMin: 120, calRange: 10, waterGoal: 100 }, 'default goals 2600 / 150 g, hit at 120 g, ±10%, water 100 oz');
F.quickAdd({ date: day, meal: 'lunch', label: 'A', cal: 1000, protein: 119 });
A.recheck(day);
eq([done('calories'), done('protein')], [false, false], '1000 cal / 119 g: neither');
const e = F.quickAdd({ date: day, meal: 'dinner', label: 'B', cal: 1400, protein: 1 });
A.recheck(day);
eq([done('calories'), done('protein')], [true, true], '2400 cal / 120 g: both');
eq(H.getLog()[day].calories.xp, 60, 'auto check-in carries habit XP');
F.updateEntry(e.id, { cal: 2000 });
A.recheck(day);
eq(done('calories'), false, '3000 cal (over +10%): calories unchecked');
F.saveGoals({ calRange: 20 });
A.recheck(day);
eq(done('calories'), true, 'wider range ±20% (max 3120): checked again');
F.deleteEntry(e.id);
A.recheck(day);
eq([done('calories'), done('protein')], [false, false], 'delete entry: both unchecked');
// Water: ticks the water habit at the goal (oz per food day)
{
  const wday = '2026-10-25';
  const wdone = () => !!H.getLog()[wday]?.water;
  eq(H.getHabits().find((h) => h.id === 'water').auto, 'food:water', 'water habit is auto from the Food tab');
  eq(F.getGoals().waterGoal, 100, 'default water goal 100 oz');
  F.addWater(wday, 64); A.recheck(wday);
  eq([F.waterFor(wday), wdone()], [64, false], '64 oz: not yet');
  F.addWater(wday, 36); A.recheck(wday);
  eq([F.waterFor(wday), wdone()], [100, true], '100 oz: water ticked');
  F.addWater(wday, -8); A.recheck(wday);
  eq(wdone(), false, 'remove 8 oz: unticked');
  F.addWater(wday, -500);
  eq(F.waterFor(wday), 0, 'water never goes below 0');
  F.saveGoals({ waterGoal: 80 }); F.addWater(wday, 80); A.recheck(wday);
  eq(wdone(), true, 'goal is editable (80 oz)');
  F.saveGoals({ waterGoal: 100 });
}

// Food logged ahead on a future day ticks nothing until that day comes
{
  const future = '2099-01-05';
  F.quickAdd({ date: future, meal: 'lunch', label: 'Prep', cal: 2600, protein: 150 });
  A.recheck(future);
  eq(!!H.getLog()[future], false, 'future day: no ticks or XP yet');
}
eq(Object.keys(mem).every((k) => k.startsWith('imp_')), true, 'only imp_ keys written');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;

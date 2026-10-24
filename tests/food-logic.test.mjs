// Food-day tests copied from KasenE08/calorie-tracker. Run: node --test tests/food-logic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealForTime, appDateFor, scale, convertAmount, totals, searchFoods, addDays } from '../js/food/logic.js';

// Local time on Thu Oct 15, 2026 (seconds optional)
const at = (h, m, s = 0) => new Date(2026, 9, 15, h, m, s);

const cases = [
  // [label, time, meal, app date]
  ['12:00 AM', at(0, 0), 'late', '2026-10-14'],
  ['12:01 AM', at(0, 1), 'late', '2026-10-14'],
  ['1:00 AM', at(1, 0), 'late', '2026-10-14'],
  ['4:00 AM', at(4, 0), 'late', '2026-10-14'],
  ['4:01 AM', at(4, 1), 'breakfast', '2026-10-15'],
  ['5:59 AM', at(5, 59), 'breakfast', '2026-10-15'],
  ['6:00 AM', at(6, 0), 'breakfast', '2026-10-15'],
  ['11:00 AM', at(11, 0), 'breakfast', '2026-10-15'],
  ['11:01 AM', at(11, 1), 'lunch', '2026-10-15'],
  ['4:00 PM', at(16, 0), 'lunch', '2026-10-15'],
  ['4:01 PM', at(16, 1), 'dinner', '2026-10-15'],
  ['9:00 PM', at(21, 0), 'dinner', '2026-10-15'],
  ['9:01 PM', at(21, 1), 'late', '2026-10-15'],
  ['11:59 PM', at(23, 59), 'late', '2026-10-15'],
];

for (const [label, time, meal, date] of cases) {
  test(`${label} → ${meal} on ${date}`, () => {
    assert.equal(mealForTime(time), meal);
    assert.equal(appDateFor(time), date);
  });
}

test('seconds are ignored (goes by the minute)', () => {
  assert.equal(mealForTime(at(11, 0, 59)), 'breakfast');
  assert.equal(mealForTime(at(16, 0, 59)), 'lunch');
  assert.equal(mealForTime(at(21, 0, 59)), 'dinner');
  assert.equal(mealForTime(at(4, 0, 59)), 'late');
  assert.equal(appDateFor(at(4, 0, 59)), '2026-10-14');
});

test('late night rolls back across month and year boundaries', () => {
  assert.equal(appDateFor(new Date(2026, 10, 1, 1, 0)), '2026-10-31');
  assert.equal(appDateFor(new Date(2027, 0, 1, 0, 30)), '2026-12-31');
  assert.equal(appDateFor(new Date(2028, 2, 1, 2, 0)), '2028-02-29'); // leap year
});

test('addDays', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

const chicken = { servingGrams: 100, cal: 165, protein: 31 };

test('scale by servings', () => {
  assert.deepEqual(scale(chicken, 'servings', 1.5), { cal: 248, protein: 47 });
  assert.deepEqual(scale(chicken, 'servings', 0), { cal: 0, protein: 0 });
});

test('scale by grams, protein in whole grams', () => {
  assert.deepEqual(scale(chicken, 'grams', 220), { cal: 363, protein: 68 });
  assert.deepEqual(scale({ servingGrams: 186, cal: 206, protein: 4 }, 'grams', 279), { cal: 309, protein: 6 });
});

test('convert between servings and grams', () => {
  assert.equal(convertAmount(chicken, 'servings', 'grams', 1.5), 150);
  assert.equal(convertAmount(chicken, 'grams', 'servings', 220), 2.2);
  assert.equal(convertAmount({ servingGrams: 30 }, 'grams', 'servings', 100), 3.33);
});

test('totals', () => {
  assert.deepEqual(totals([{ cal: 100, protein: 5 }, { cal: 250, protein: 30 }]), { cal: 350, protein: 35 });
  assert.deepEqual(totals([]), { cal: 0, protein: 0 });
});

test('searchFoods is case-insensitive and sorted', () => {
  const foods = [{ name: 'White rice' }, { name: 'Chicken thigh' }, { name: 'chicken breast' }];
  assert.deepEqual(searchFoods(foods, 'CHICK').map(f => f.name), ['chicken breast', 'Chicken thigh']);
  assert.equal(searchFoods(foods, '  ').length, 3);
});

test('progress: under, exactly at, and over the goal', async () => {
  const { progress } = await import('../js/food/logic.js');
  assert.deepEqual(progress(1840, 2600), { eaten: 1840, goal: 2600, remaining: 760, over: false, pct: 1840 / 2600 });
  const at = progress(2600, 2600);
  assert.equal(at.remaining, 0); assert.equal(at.over, false); assert.equal(at.pct, 1);
  const over = progress(2840, 2600);
  assert.equal(over.remaining, -240); assert.equal(over.over, true); assert.equal(over.pct, 1);
  assert.equal(progress(10, 0).pct, 0);
});

test('formatSigned uses a minus sign and commas', async () => {
  const { formatSigned } = await import('../js/food/logic.js');
  assert.equal(formatSigned(760), '760');
  assert.equal(formatSigned(0), '0');
  assert.equal(formatSigned(-240), '−240');
  assert.equal(formatSigned(-1240), '−1,240');
});

test('weekStartOf finds Monday; weekDates gives Mon–Sun', async () => {
  const { weekStartOf, weekDates } = await import('../js/food/logic.js');
  assert.equal(weekStartOf('2026-10-15'), '2026-10-12'); // Thu → Mon
  assert.equal(weekStartOf('2026-10-12'), '2026-10-12'); // Mon
  assert.equal(weekStartOf('2026-10-18'), '2026-10-12'); // Sun
  assert.equal(weekStartOf('2027-01-01'), '2026-12-28'); // across years
  assert.deepEqual(weekDates('2026-10-26'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
});

test('entryFieldsFromItem copies values (not references) and rescales', async () => {
  const { entryFieldsFromItem } = await import('../js/food/logic.js');
  const item = { kind: 'food', foodId: 'f1', name: 'Chicken', unit: 'grams', amount: 220, snapshot: { servingGrams: 100, cal: 165, protein: 31 } };
  const e = entryFieldsFromItem(item);
  assert.equal(e.cal, 363); assert.equal(e.protein, 68);
  e.snapshot.cal = 1;
  assert.equal(item.snapshot.cal, 165);
  assert.deepEqual(entryFieldsFromItem({ kind: 'quick', name: 'Coffee', cal: 60, protein: 3 }), { kind: 'quick', name: 'Coffee', cal: 60, protein: 3 });
});

test('validateBackup accepts a real backup and summarizes it', async () => {
  const { validateBackup } = await import('../js/food/logic.js');
  const backup = {
    app: 'calorie-tracker', exportedAt: '2026-10-15T20:00:00.000Z', version: 1,
    settings: { calGoal: 2400, proteinGoal: 170 },
    foods: [{ id: 'a', name: 'Rice', servingGrams: 186, cal: 206, protein: 4 }],
    entries: [
      { id: '1', kind: 'quick', name: 'X', date: '2026-10-14', meal: 'lunch', cal: 100, protein: 5 },
      { id: '2', kind: 'quick', name: 'Y', date: '2026-10-12', meal: 'late', cal: 50, protein: 0 },
      { id: '3', kind: 'quick', name: 'Z', date: '2026-10-14', meal: 'dinner', cal: 50, protein: 0 },
    ],
    savedMeals: [{ id: 'm', name: 'M', category: 'breakfast', items: [] }],
  };
  const r = validateBackup(backup);
  assert.equal(r.ok, true);
  assert.deepEqual(r.summary, { foods: 1, entries: 3, savedMeals: 1, days: 2, first: '2026-10-12', last: '2026-10-14', exportedAt: '2026-10-15T20:00:00.000Z' });
  assert.deepEqual(r.data.settings, { calGoal: 2400, proteinGoal: 170 });
});

test('validateBackup rejects other files and damaged data', async () => {
  const { validateBackup } = await import('../js/food/logic.js');
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup([]).ok, false);
  assert.equal(validateBackup({ foods: [], entries: [] }).ok, false); // not ours
  const base = { app: 'calorie-tracker', foods: [], entries: [], savedMeals: [] };
  assert.equal(validateBackup(base).ok, true);
  assert.equal(validateBackup({ ...base, entries: [{ date: '10/14/2026', meal: 'lunch', cal: 1, protein: 1, name: 'x' }] }).ok, false);
  assert.equal(validateBackup({ ...base, entries: [{ date: '2026-10-14', meal: 'brunch', cal: 1, protein: 1, name: 'x' }] }).ok, false);
  assert.equal(validateBackup({ ...base, foods: [{ name: 'x', servingGrams: 0, cal: 1, protein: 1 }] }).ok, false);
  assert.deepEqual(validateBackup({ ...base, settings: { calGoal: -5 } }).data.settings, { calGoal: null, proteinGoal: null });
});

// ---------- Improve additions ----------
import { hitCalories, hitProtein } from '../js/food/logic.js';
test('hitCalories: within ±10% of goal, nothing logged = not hit', () => {
  assert.equal(hitCalories(0, 2600, 10), false);
  assert.equal(hitCalories(2339, 2600, 10), false);
  assert.equal(hitCalories(2340, 2600, 10), true);
  assert.equal(hitCalories(2860, 2600, 10), true);
  assert.equal(hitCalories(2861, 2600, 10), false);
});
test('hitProtein: at least the minimum', () => {
  assert.equal(hitProtein(119, 120), false);
  assert.equal(hitProtein(120, 120), true);
  assert.equal(hitProtein(200, 120), true);
});

// Copied from KasenE08/calorie-tracker js/logic.js (commit e9e5d30). Food-day rules unchanged.
// Additions for Improve are at the bottom (goal "hit" rules for auto-checking habits).
// Pure logic: meal windows, app day, scaling, totals. No DOM, no storage.
// Shared by the app (browser) and the tests (node --test).

export const MEALS = ['breakfast', 'lunch', 'dinner', 'late'];
export const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', late: 'Late Night' };

// Meal windows, in minutes after midnight, end-inclusive (seconds are ignored):
//   Breakfast  4:01 AM – 11:00 AM
//   Lunch     11:01 AM –  4:00 PM
//   Dinner     4:01 PM –  9:00 PM
//   Late Night 9:01 PM –  4:00 AM (12:00–4:00 AM counts toward the previous date)
const DAY_START = 4 * 60 + 1; // 4:01 AM — the app day starts here

const minuteOfDay = d => d.getHours() * 60 + d.getMinutes();

export function mealForTime(d) {
  const m = minuteOfDay(d);
  if (m >= DAY_START && m <= 11 * 60) return 'breakfast';
  if (m >= 11 * 60 + 1 && m <= 16 * 60) return 'lunch';
  if (m >= 16 * 60 + 1 && m <= 21 * 60) return 'dinner';
  return 'late';
}

// The calendar date (YYYY-MM-DD, local time) this moment belongs to.
// Before 4:01 AM it still belongs to the previous date.
export function appDateFor(d) {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (minuteOfDay(d) < DAY_START) day.setDate(day.getDate() - 1);
  return toISODate(day);
}

export function toISODate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

// Scale a food's per-serving values to an amount in servings or grams.
// Calories and protein are whole numbers.
export function scale(snapshot, unit, amount) {
  const servings = unit === 'grams' ? amount / snapshot.servingGrams : amount;
  return {
    cal: Math.round(snapshot.cal * servings),
    protein: Math.round(snapshot.protein * servings),
  };
}

export function convertAmount(snapshot, fromUnit, toUnit, amount) {
  if (fromUnit === toUnit) return amount;
  if (toUnit === 'grams') return round(amount * snapshot.servingGrams, 0);
  return round(amount / snapshot.servingGrams, 2);
}

export function round(n, places) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function totals(entries) {
  return entries.reduce((t, e) => ({ cal: t.cal + e.cal, protein: t.protein + e.protein }), { cal: 0, protein: 0 });
}

export function searchFoods(foods, query) {
  const q = query.trim().toLowerCase();
  const list = q ? foods.filter(f => f.name.toLowerCase().includes(q)) : foods.slice();
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

// Goal progress for one number (calories or protein).
// Over only when eaten is strictly more than the goal.
export function progress(eaten, goal) {
  const remaining = goal - eaten;
  return { eaten, goal, remaining, over: remaining < 0, pct: goal > 0 ? Math.min(eaten / goal, 1) : 0 };
}

// "1,234" or "−240" (true minus sign) for the big remaining number.
export function formatSigned(n) {
  const s = Math.abs(Math.round(n)).toLocaleString('en-US');
  return n < 0 ? `−${s}` : s;
}

// Monday of the week containing this date.
export function weekStartOf(iso) {
  const d = fromISODate(iso);
  const back = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(iso, -back);
}

export const weekDates = start => Array.from({ length: 7 }, (_, i) => addDays(start, i));

// New entry fields from a saved-meal item or a logged entry (for Repeat).
export function entryFieldsFromItem(item) {
  if (item.kind === 'food') {
    return { kind: 'food', foodId: item.foodId, name: item.name, unit: item.unit, amount: item.amount,
      snapshot: { ...item.snapshot }, ...scale(item.snapshot, item.unit, item.amount) };
  }
  return { kind: 'quick', name: item.name, cal: item.cal, protein: item.protein };
}

// ---------- Backup ----------
const isNum = n => typeof n === 'number' && Number.isFinite(n);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Checks an imported backup before anything is overwritten.
// Returns { ok: true, data, summary } or { ok: false, error }.
export function validateBackup(obj) {
  const bad = error => ({ ok: false, error });
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return bad('This file isn’t a Calorie Tracker backup.');
  if (obj.app !== 'calorie-tracker') return bad('This file isn’t a Calorie Tracker backup.');
  const { foods, entries } = obj;
  const savedMeals = obj.savedMeals ?? [];
  if (!Array.isArray(foods) || !Array.isArray(entries) || !Array.isArray(savedMeals)) return bad('The backup is missing data.');
  if (!foods.every(f => f && typeof f.name === 'string' && isNum(f.servingGrams) && f.servingGrams > 0 && isNum(f.cal) && isNum(f.protein))) {
    return bad('A saved food in the backup is damaged.');
  }
  if (!entries.every(e => e && isDate(e.date) && MEALS.includes(e.meal) && isNum(e.cal) && isNum(e.protein) && typeof e.name === 'string')) {
    return bad('A logged entry in the backup is damaged.');
  }
  if (!savedMeals.every(m => m && typeof m.name === 'string' && MEALS.includes(m.category) && Array.isArray(m.items))) {
    return bad('A saved meal in the backup is damaged.');
  }
  const s = obj.settings || {};
  const settings = {
    calGoal: isNum(s.calGoal) && s.calGoal > 0 ? s.calGoal : null,
    proteinGoal: isNum(s.proteinGoal) && s.proteinGoal > 0 ? s.proteinGoal : null,
  };
  const dates = entries.map(e => e.date).sort();
  return {
    ok: true,
    data: { version: 1, settings, foods, entries, savedMeals },
    summary: {
      foods: foods.length, entries: entries.length, savedMeals: savedMeals.length,
      days: new Set(dates).size, first: dates[0] || null, last: dates[dates.length - 1] || null,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : null,
    },
  };
}

// ---------- Improve: "hit" rules for auto-checking habits ----------
// Calories: within ±calRange% of the goal (only once something is logged).
// Protein: at least proteinMin grams (goal itself can be higher).
export function hitCalories(eaten, goal, rangePct) {
  if (!(eaten > 0) || !(goal > 0)) return false;
  const r = (goal * rangePct) / 100;
  return eaten >= goal - r && eaten <= goal + r;
}

export function hitWater(oz, goal) {
  return goal > 0 && oz >= goal;
}

export function hitProtein(eaten, min) {
  return min > 0 && eaten >= min;
}

// Food data, adapted from KasenE08/calorie-tracker js/store.js.
// Same shape as the original app, saved as one blob under Improve's own key: imp_food.
import * as store from '../store.js';
import { scale, entryFieldsFromItem } from './logic.js';

const KEY = 'food';

// Goals: calorie + protein goal, plus the rules for auto-checking habits.
//   calRange   "Hit calories" = within ±calRange % of calGoal
//   proteinMin "Hit protein"  = at least proteinMin grams (goal can be higher)
//   waterGoal  "Hit water" = at least this many oz
export const DEFAULT_GOALS = { calGoal: 2600, proteinGoal: 150, proteinMin: 120, calRange: 10, waterGoal: 100 };

const empty = () => ({
  version: 1,
  settings: { ...DEFAULT_GOALS },
  foods: [],      // { id, name, servingGrams, cal, protein }
  entries: [],    // { id, kind: 'food'|'quick', name, date, meal, cal, protein, … }
  savedMeals: [], // { id, name, category, items }
  water: {},      // { 'YYYY-MM-DD': oz } per food day
});

let state = load();

function load() {
  const s = store.get(KEY, null);
  return s ? { ...empty(), ...s, settings: { ...DEFAULT_GOALS, ...(s.settings || {}) } } : empty();
}
export const reload = () => { state = load(); };
const save = () => store.set(KEY, state);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const getState = () => state;
export const isEmpty = () => !state.entries.length && !state.foods.length && !state.savedMeals.length;

// ---------- Goals ----------
export const getGoals = () => ({ ...DEFAULT_GOALS, ...state.settings });
export function saveGoals(g) {
  state.settings = { ...state.settings, ...g };
  save();
}

// ---------- Saved foods ----------
export const getFood = (id) => state.foods.find((f) => f.id === id);

export function saveFood({ id, name, servingGrams, cal, protein }) {
  const food = { id: id || uid(), name: name.trim(), servingGrams, cal, protein };
  const i = state.foods.findIndex((f) => f.id === food.id);
  if (i >= 0) state.foods[i] = food; else state.foods.push(food);
  save();
  return food;
}

export function deleteFood(id) {
  state.foods = state.foods.filter((f) => f.id !== id);
  save();
}

// ---------- Entries ----------
// Each entry keeps a snapshot of the food's values, so editing a saved food never changes the past.
export function logFood(food, { date, meal, unit, amount }) {
  const snapshot = { servingGrams: food.servingGrams, cal: food.cal, protein: food.protein };
  const entry = { id: uid(), kind: 'food', foodId: food.id, name: food.name, date, meal, unit, amount, snapshot,
    ...scale(snapshot, unit, amount), loggedAt: new Date().toISOString() };
  state.entries.push(entry);
  save();
  return entry;
}

export function quickAdd({ date, meal, label, cal, protein }) {
  const entry = { id: uid(), kind: 'quick', name: label.trim() || 'Quick add', date, meal, cal, protein, loggedAt: new Date().toISOString() };
  state.entries.push(entry);
  save();
  return entry;
}

export const getEntry = (id) => state.entries.find((e) => e.id === id);

export function updateEntry(id, changes) {
  const e = getEntry(id);
  if (!e) return;
  Object.assign(e, changes);
  if (e.kind === 'food') Object.assign(e, scale(e.snapshot, e.unit, e.amount));
  save();
}

export function deleteEntry(id) {
  state.entries = state.entries.filter((e) => e.id !== id);
  save();
}

export const entriesFor = (date) => state.entries.filter((e) => e.date === date);

export function addEntries(items, { date, meal }) {
  const loggedAt = new Date().toISOString();
  for (const item of items) state.entries.push({ id: uid(), ...entryFieldsFromItem(item), date, meal, loggedAt });
  save();
}

// ---------- Water (oz per food day) ----------
export const waterFor = (date) => state.water?.[date] || 0;
export function addWater(date, oz) {
  state.water ||= {};
  const v = Math.max(0, Math.round((waterFor(date) + oz) * 10) / 10);
  if (v) state.water[date] = v; else delete state.water[date];
  save();
  return v;
}

// ---------- Saved meals ----------
export const getMeal = (id) => state.savedMeals.find((m) => m.id === id);

export function saveMeal({ id, name, category, items }) {
  const meal = { id: id || uid(), name: name.trim(), category, items: structuredClone(items) };
  const i = state.savedMeals.findIndex((m) => m.id === meal.id);
  if (i >= 0) state.savedMeals[i] = meal; else state.savedMeals.push(meal);
  save();
  return meal;
}

export function deleteMeal(id) {
  state.savedMeals = state.savedMeals.filter((m) => m.id !== id);
  save();
}

export function mealItemsForAdding(meal) {
  return meal.items.map((it) => {
    const food = it.kind === 'food' && getFood(it.foodId);
    if (!food) return it;
    return { ...it, name: food.name, snapshot: { servingGrams: food.servingGrams, cal: food.cal, protein: food.protein } };
  });
}

// ---------- Import from the old Calorie Tracker ----------
// `data` comes from logic.validateBackup. Copies foods, entries and meals; takes the
// old calorie goal; keeps Improve's protein goal + hit rules. Replaces Improve's food data.
export function importFromCalorieTracker(data) {
  const keep = getGoals();
  state = {
    ...empty(),
    foods: structuredClone(data.foods),
    entries: structuredClone(data.entries),
    savedMeals: structuredClone(data.savedMeals),
    water: state.water || {}, // the old app didn't track water: keep Improve's
    settings: { ...keep, calGoal: data.settings.calGoal || keep.calGoal },
  };
  save();
}

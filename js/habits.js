// Habit data + completion history.
//
// Storage (all under the imp_ prefix):
//   imp_schema      number, data format version
//   imp_categories  [{ id, name, icon }]
//   imp_habits      [{ id, name, category, frequency: daily|weekly|monthly, target, xp, order, archived, auto }]
//   imp_profile     { name }
//   imp_log         { "YYYY-MM-DD": { habitId: { n: count, xp: xpPerCompletionAtTheTime, c: categoryAtTheTime } } }
//   imp_bonus       { "YYYY-MM-DD": { bonusId: { type, xp, c?, habit?, n? } } }   (see rewards.js)
//   imp_ranks       [{ min, name }]                                             (see levels.js)
//   imp_last_backup ISO date of the last export
//
// Resets are automatic: progress is always counted from the log inside the
// current period (today / Mon–Sun week / calendar month), so nothing is ever
// wiped and the full by-date history stays available for streaks and stats.

import * as store from './store.js';
import { dayKey, periodRange } from './dates.js';
import { DEFAULT_CATEGORIES, DEFAULT_HABITS, DEFAULT_PROFILE } from './defaults.js';

export const SCHEMA = 2;
export const FREQS = ['daily', 'weekly', 'monthly'];

// Seeds a fresh install. Returns the schema version found before (0 = fresh),
// so the app can run one-time upgrades. Existing data is never overwritten.
export function init() {
  const found = store.get('schema') ?? 0;
  if (found === 0) {
    store.set('categories', DEFAULT_CATEGORIES);
    store.set('habits', DEFAULT_HABITS);
    store.set('profile', DEFAULT_PROFILE);
    store.set('log', {});
    store.set('bonus', {});
  }
  if (found < SCHEMA) store.set('schema', SCHEMA);
  return found;
}

// ---- Profile ----
export const getProfile = () => ({ ...DEFAULT_PROFILE, ...store.get('profile', {}) });
export const saveProfile = (p) => store.set('profile', p);

// ---- Categories ----
export const getCategories = () => store.get('categories', DEFAULT_CATEGORIES);
export const saveCategories = (list) => store.set('categories', list);
export const categoryById = (id) => getCategories().find((c) => c.id === id);

// ---- Habits ----
export const getAllHabits = () => store.get('habits', DEFAULT_HABITS);
export const getHabits = () => getAllHabits().filter((h) => !h.archived).sort((a, b) => a.order - b.order);
export const saveHabits = (list) => store.set('habits', list);

export function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function upsertHabit(h) {
  const all = getAllHabits();
  const i = all.findIndex((x) => x.id === h.id);
  if (i >= 0) all[i] = { ...all[i], ...h };
  else all.push({ archived: false, auto: null, order: all.length, ...h });
  saveHabits(all);
}

// Deleting archives the habit so old history still makes sense.
export function archiveHabit(id) {
  saveHabits(getAllHabits().map((h) => (h.id === id ? { ...h, archived: true } : h)));
}

// ---- Log ----
export const getLog = () => store.get('log', {});
const saveLog = (log) => store.set('log', log);

// Completions of a habit in the period containing `date`
export function progress(habit, date = new Date(), log = getLog()) {
  const [start, end] = periodRange(habit.frequency, date);
  let n = 0;
  for (const day in log) {
    if (day >= start && day <= end && log[day][habit.id]) n += log[day][habit.id].n;
  }
  return n;
}

// Add (+1) or remove (-1) one completion. Returns the XP change (0 if nothing changed).
export function step(habit, delta, date = new Date()) {
  const log = getLog();
  const today = dayKey(date);
  const done = progress(habit, date, log);

  if (delta > 0) {
    if (done >= habit.target) return 0;
    const day = (log[today] ||= {});
    const e = (day[habit.id] ||= { n: 0, xp: habit.xp });
    e.n += 1;
    e.xp = habit.xp;
    e.c = habit.category;
    saveLog(log);
    return habit.xp;
  }

  if (done <= 0) return 0;
  // Undo today's completion first, otherwise the most recent day in this period
  const [start] = periodRange(habit.frequency, date);
  const days = Object.keys(log).filter((d) => d >= start && d <= today && log[d][habit.id]?.n > 0).sort();
  const day = days.includes(today) ? today : days[days.length - 1];
  const e = log[day][habit.id];
  e.n -= 1;
  const xp = e.xp;
  if (e.n <= 0) delete log[day][habit.id];
  if (!Object.keys(log[day]).length) delete log[day];
  saveLog(log);
  return -xp;
}

// Set a habit done / not done on a date (used by auto-checks from other tabs).
// Returns true if anything changed.
export function setDone(habit, day, done) {
  const log = getLog();
  const cur = log[day]?.[habit.id]?.n || 0;
  const want = done ? Math.max(1, habit.frequency === 'daily' ? habit.target : 1) : 0;
  if (cur === want) return false;
  if (want) (log[day] ||= {})[habit.id] = { n: want, xp: habit.xp, c: habit.category };
  else {
    delete log[day][habit.id];
    if (!Object.keys(log[day]).length) delete log[day];
  }
  saveLog(log);
  return true;
}

// Index: counts[habitId][day] = n  (fast lookups for streaks and stats)
export function countsIndex(log = getLog()) {
  const idx = {};
  for (const day in log) for (const id in log[day]) (idx[id] ||= {})[day] = log[day][id].n;
  return idx;
}

// XP earned from habits on a given day (bonuses are separate, see rewards.js)
export function xpOnDay(key = dayKey(), log = getLog()) {
  const day = log[key] || {};
  return Object.values(day).reduce((sum, e) => sum + e.n * e.xp, 0);
}

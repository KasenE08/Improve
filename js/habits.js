// Habit data + completion history.
//
// Storage (all under the imp_ prefix):
//   imp_schema      number, data format version
//   imp_categories  [{ id, name, icon }]
//   imp_habits      [{ id, name, category, frequency: daily|weekly|monthly, target, xp, order, archived, auto }]
//   imp_profile     { name }
//   imp_log         { "YYYY-MM-DD": { habitId: { n: count, xp: xpPerCompletionAtTheTime } } }
//
// Resets are automatic: progress is always counted from the log inside the
// current period (today / Mon–Sun week / calendar month), so nothing is ever
// wiped and the full by-date history stays available for streaks and stats.

import * as store from './store.js';
import { dayKey, periodRange } from './dates.js';
import { DEFAULT_CATEGORIES, DEFAULT_HABITS, DEFAULT_PROFILE } from './defaults.js';

const SCHEMA = 1;
export const FREQS = ['daily', 'weekly', 'monthly'];

export function init() {
  if (store.get('schema') == null) {
    store.set('categories', DEFAULT_CATEGORIES);
    store.set('habits', DEFAULT_HABITS);
    store.set('profile', DEFAULT_PROFILE);
    store.set('log', {});
    store.set('schema', SCHEMA);
  }
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

// XP earned on a given day
export function xpOnDay(key = dayKey(), log = getLog()) {
  const day = log[key] || {};
  return Object.values(day).reduce((sum, e) => sum + e.n * e.xp, 0);
}

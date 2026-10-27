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
//   imp_journal     { settings: { minWords }, days: { "YYYY-MM-DD": text } }   (see journal/store.js)
//
// Resets are automatic: progress is always counted from the log inside the
// current period (today / Mon–Sun week / calendar month), so nothing is ever
// wiped and the full by-date history stays available for streaks and stats.

import * as store from './store.js';
import { dayKey, periodRange, appNow, DAY_START_MIN } from './dates.js';
import { DEFAULT_CATEGORIES, DEFAULT_HABITS, DEFAULT_PROFILE } from './defaults.js';
import { monthlyOpen } from './launch.js';

// Monthly habits wait for the first full habit month (see launch.js)
export const notStarted = (habit, date = appNow()) => habit.frequency === 'monthly' && !monthlyOpen(dayKey(date));

export const SCHEMA = 6;
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
  // Schema 3 (Money tab): "Save % of paycheck" and "Budget review" tick from the Money tab;
  // "Log spending" stays a manual tap.
  if (found > 0 && found < 3) {
    const MONEY_AUTO = { 'save-paycheck': 'money:save', 'budget-review': 'money:review', 'log-spending': null };
    store.set('habits', store.get('habits', []).map((h) => (h.id in MONEY_AUTO ? { ...h, auto: MONEY_AUTO[h.id] } : h)));
  }
  // Schema 4 (Journal tab): "Journal" ticks from the words written today.
  if (found > 0 && found < 4) {
    store.set('habits', store.get('habits', []).map((h) => (h.id === 'journal' ? { ...h, auto: 'journal:words' } : h)));
  }
  // Schema 5: auto habits can wait until a time of day; "Work done on schedule" waits until 3 PM.
  if (found > 0 && found < 5) {
    store.set('habits', store.get('habits', []).map((h) => (h.id === 'work-on-schedule' && h.autoAfter === undefined ? { ...h, autoAfter: 15 * 60 } : h)));
  }
  // Schema 6: new daily "Be proactive", right after "Kept my word" and worth the same.
  if (found > 0 && found < 6) {
    const all = store.get('habits', []);
    if (!all.some((h) => h.id === 'proactive')) {
      const kw = all.find((h) => h.id === 'kept-word');
      const at = kw ? kw.order + 1 : all.reduce((m, h) => Math.max(m, h.order + 1), 0);
      const shifted = all.map((h) => (h.order >= at ? { ...h, order: h.order + 1 } : h));
      shifted.push({ id: 'proactive', name: 'Be proactive', category: kw?.category || 'mind', frequency: 'daily', target: 1, xp: kw?.xp ?? 10, order: at, archived: false, auto: null });
      store.set('habits', shifted);
    }
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
export function progress(habit, date = appNow(), log = getLog()) {
  const [start, end] = periodRange(habit.frequency, date);
  let n = 0;
  for (const day in log) {
    if (day >= start && day <= end && log[day][habit.id]) n += log[day][habit.id].n;
  }
  return n;
}

// Add (+1) or remove (-1) one completion. Returns the XP change (0 if nothing changed).
export function step(habit, delta, date = appNow()) {
  const log = getLog();
  const today = dayKey(date);
  const done = progress(habit, date, log);

  if (delta > 0) {
    if (done >= habit.target || notStarted(habit, date)) return 0;
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

// Auto habits never tick a day that hasn't started yet, and can wait until a time of day
// (habit.autoAfter, minutes after midnight). Past days are always allowed; today only once that time has come. Between midnight and
// 4 AM it's still "today" (the app day ends at 4 AM), so that counts as after any afternoon time.
export function autoTimeReached(habit, day, now = new Date()) {
  const today = dayKey(appNow(now));
  if (day > today) return false; // a future day (e.g. food logged ahead) waits until that day comes
  if (habit.frequency === 'monthly' && !monthlyOpen(day)) return false;
  if (habit.autoAfter == null || day < today) return true;
  const late = (m) => (m < DAY_START_MIN ? m + 1440 : m);
  return late(now.getHours() * 60 + now.getMinutes()) >= late(habit.autoAfter);
}

// Set a habit done / not done on a date (used by auto-checks from other tabs).
// Returns true if anything changed.
export function setDone(habit, day, done, now = new Date()) {
  if (done && !autoTimeReached(habit, day, now)) done = false;
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

// Weekly / monthly version for auto-checks: done = exactly one completion somewhere in the
// period containing `date` (added on that date if missing); not done = none in the period.
// Returns true if anything changed.
export function setPeriodDone(habit, date, done, now = new Date()) {
  if (habit.frequency === 'daily') return setDone(habit, dayKey(date), done, now);
  if (done && !autoTimeReached(habit, dayKey(date), now)) done = false;
  const log = getLog();
  const [start, end] = periodRange(habit.frequency, date);
  const days = Object.keys(log).filter((d) => d >= start && d <= end && log[d][habit.id]);
  if (done) {
    if (days.length) return false;
    (log[dayKey(date)] ||= {})[habit.id] = { n: 1, xp: habit.xp, c: habit.category };
  } else {
    if (!days.length) return false;
    for (const d of days) {
      delete log[d][habit.id];
      if (!Object.keys(log[d]).length) delete log[d];
    }
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

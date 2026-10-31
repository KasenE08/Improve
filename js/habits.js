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
import { dayKey, fromDayKey, periodRange, appNow, DAY_START_MIN } from './dates.js';
import { DEFAULT_CATEGORIES, DEFAULT_HABITS, DEFAULT_PROFILE } from './defaults.js';
import { monthlyOpen } from './launch.js';

// Habit kinds: a goal ("do it N times", the default) or a limit ("at most N times", e.g. fast food ≤ 2 a week).
// Taps on a limit habit only count uses (no XP); its XP comes when the period ends at or under the limit (rewards.js).
export const isLimit = (h) => h?.kind === 'limit';
// Done for the period: goal reached, or for a limit, still at or under it
export const isDone = (h, n) => (isLimit(h) ? n <= h.target : n >= h.target);
export const LIMIT_MAX_USES = 99;

// Monthly habits wait for the first full habit month (see launch.js)
export const notStarted = (habit, date = appNow()) => habit.frequency === 'monthly' && !monthlyOpen(dayKey(date));

export const SCHEMA = 14;
export const FREQS = ['daily', 'weekly', 'monthly'];

// Seeds a fresh install. Returns the schema version found before (0 = fresh),
// so the app can run one-time upgrades. Existing data is never overwritten.
export function init() {
  const found = store.get('schema') ?? 0;
  if (found === 0) {
    store.set('categories', DEFAULT_CATEGORIES);
    // Limit habits are judged from install day on (no payout for weeks before the app was used)
    const today = dayKey(appNow());
    store.set('habits', DEFAULT_HABITS.map((h) => (h.kind === 'limit' ? { ...h, limitSince: today } : h)));
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
  // Schema 7: XP re-rated by difficulty × importance, Weekly review + Wardrobe review removed, and the level
  // curve doubled to match. Ticks and bonuses so far are re-counted at the new amounts so levels stay put.
  if (found > 0 && found < 7) {
    const NEW_XP = Object.fromEntries(DEFAULT_HABITS.map((h) => [h.id, h.xp]));
    const REMOVED = ['weekly-review', 'wardrobe-review'];
    const habits = store.get('habits', []).map((h) => {
      if (REMOVED.includes(h.id)) return { ...h, archived: true };
      if (h.id in NEW_XP) return { ...h, xp: NEW_XP[h.id] };
      if (/fast\s*food/i.test(h.name || '')) return { ...h, xp: 40 };
      return { ...h, xp: h.xp * 2 }; // other habits you added keep the same weight on the new curve
    });
    store.set('habits', habits);
    const byId = new Map(habits.map((h) => [h.id, h]));
    const log = store.get('log', {});
    for (const day in log) {
      for (const id in log[day]) {
        const e = log[day][id], h = byId.get(id);
        if (!e.xp) continue; // limit uses stay at 0
        e.xp = h && !h.archived ? h.xp : e.xp * 2;
      }
    }
    store.set('log', log);
    const bonus = store.get('bonus', {});
    for (const day in bonus) {
      for (const b of Object.values(bonus[day])) {
        if (b.type === 'limit' && byId.get(b.habit)) b.xp = byId.get(b.habit).xp;
        else b.xp *= 2; // Perfect Day 50 → 100, streak milestones doubled
      }
    }
    store.set('bonus', bonus);
  }
  // Schema 8: oral care twice a day (5 XP each, same 10/day), and AM + PM skincare merged into one
  // "Skincare" twice a day (10 XP each, same 20/day). History is merged so streaks carry on.
  if (found > 0 && found < 8) {
    let habits = store.get('habits', []);
    const today = dayKey(appNow());
    const log = store.get('log', {});
    const oral = habits.find((h) => h.id === 'oral-care');
    if (oral && oral.target === 1) {
      habits = habits.map((h) => (h.id === 'oral-care' ? { ...h, target: 2, xp: 5 } : h));
      // A past day that was done stays done (2 × 5 = the same 10 XP); today's tick counts as one of two
      for (const day in log) { const e = log[day]['oral-care']; if (e) { e.n = day < today ? 2 : Math.min(2, e.n); e.xp = 5; } }
    }
    const am = habits.find((h) => h.id === 'am-skincare');
    const pm = habits.find((h) => h.id === 'pm-skincare');
    if ((am || pm) && !habits.some((h) => h.id === 'skincare')) {
      const first = am || pm;
      const at = first.order;
      habits = habits.map((h) => (h.id === 'am-skincare' || h.id === 'pm-skincare' ? { ...h, archived: true } : h.order > at ? { ...h, order: h.order + 1 } : h));
      const archivedBoth = (!am || am.archived) && (!pm || pm.archived);
      habits.push({ id: 'skincare', name: 'Skincare (AM + PM)', category: first.category, frequency: 'daily', target: 2, xp: 10, order: at + 1, archived: archivedBoth, auto: null });
      for (const day in log) {
        const a = log[day]['am-skincare'], p = log[day]['pm-skincare'];
        if (!a && !p) continue;
        log[day].skincare = { n: Math.min(2, (a?.n || 0) + (p?.n || 0)), xp: 10, c: first.category };
        delete log[day]['am-skincare'];
        delete log[day]['pm-skincare'];
      }
    }
    store.set('habits', habits);
    store.set('log', log);
  }
  // Schema 9: "Work done on schedule" renamed to "Finished today's work" (unless you renamed it yourself)
  if (found > 0 && found < 9) {
    store.set('habits', store.get('habits', []).map((h) => (h.id === 'work-on-schedule' && h.name === 'Work done on schedule' ? { ...h, name: "Finished today's work" } : h)));
  }
  // Schema 10: Lift 60 → 40 XP per session (200 a week). Sessions already logged keep what they earned.
  if (found > 0 && found < 10) {
    store.set('habits', store.get('habits', []).map((h) => (h.id === 'lift' && h.xp === 60 ? { ...h, xp: 40 } : h)));
  }
  // Schema 11: water is tracked in the Food tab; "3L water" becomes "100 oz water" and ticks itself.
  // If it was already ticked today, today's water starts at the goal so the tick isn't lost.
  if (found > 0 && found < 11) {
    store.set('habits', store.get('habits', []).map((h) => (h.id === 'water' ? { ...h, auto: 'food:water', name: h.name === '3L water' ? '100 oz water' : h.name } : h)));
    const today = dayKey(appNow());
    if (store.get('log', {})[today]?.water) {
      const food = store.get('food', null) || {};
      const goal = food.settings?.waterGoal || 100;
      store.set('food', { ...food, water: { ...(food.water || {}), [today]: Math.max(goal, food.water?.[today] || 0) } });
    }
  }
  // Schema 12: the planner is a plain calendar now (no Start button to measure), so "Finished today's work"
  // is a habit you tick yourself. Today's "day off" for it (from the old auto check) is cleared.
  if (found > 0 && found < 12) {
    store.set('habits', store.get('habits', []).map((h) => (h.auto === 'planner:work' ? { ...h, auto: null, autoAfter: null } : h)));
    const ex = store.get('excused', {});
    const today = dayKey(appNow());
    if (ex[today]?.['work-on-schedule']) { delete ex[today]['work-on-schedule']; if (!Object.keys(ex[today]).length) delete ex[today]; store.set('excused', ex); }
  }
  // Schema 13: old names brought up to date ("3L water (100oz)" → "100 oz water", the goal is in oz now)
  if (found > 0 && found < 13) {
    store.set('habits', store.get('habits', []).map((h) => (h.id === 'water' && /3\s*L/i.test(h.name) ? { ...h, name: '100 oz water' } : h)));
  }
  // Schema 14: the Money page has no monthly review any more, so the "Budget review" habit is put away
  // (archived: its past check-ins are kept, it just stops showing).
  if (found < 14) {
    store.set('habits', store.get('habits', []).map((h) => (h.auto === 'money:review' ? { ...h, archived: true } : h)));
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

  if (delta > 0 && isLimit(habit)) {
    if (done >= LIMIT_MAX_USES || notStarted(habit, date)) return 0;
    const e = ((log[today] ||= {})[habit.id] ||= { n: 0, xp: 0 });
    e.n += 1;
    e.xp = 0;
    e.c = habit.category;
    saveLog(log);
    return 0; // uses never give XP directly
  }
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

// Days/weeks off: a period a habit had nothing to do ("Finished today's work" with nothing planned,
// "Save from paycheck" in a week with no payday). No tick and no XP, but it doesn't break the streak
// or block Perfect Day. Stored under the period's first day:
//   imp_excused { "YYYY-MM-DD": { habitId: true } }
export const getExcused = () => store.get('excused', {});
export const isExcused = (habitId, day, ex = getExcused()) => !!ex[day]?.[habitId];
export const offIn = (habit, date = appNow(), ex = getExcused()) => isExcused(habit.id, periodRange(habit.frequency, date)[0], ex);
export function setExcused(habit, day, on) {
  if (on && isOverridden(habit, day)) on = false; // a manual tick beats a day off
  const ex = getExcused();
  if (isExcused(habit.id, day, ex) === on) return false;
  if (on) (ex[day] ||= {})[habit.id] = true;
  else {
    delete ex[day][habit.id];
    if (!Object.keys(ex[day]).length) delete ex[day];
  }
  store.set('excused', ex);
  return true;
}

// Manual override for auto habits: you tick it yourself for this period (day / week / month).
// Full XP, counts like a normal tick, and the auto-checks can't take it back. Next period it's auto again.
// Stored under the period's first day:  imp_override { "YYYY-MM-DD": { habitId: true } }
export const getOverrides = () => store.get('override', {});
export function isOverridden(habit, date = appNow(), ov = getOverrides()) {
  const d = typeof date === 'string' ? fromDayKey(date) : date;
  return !!ov[periodRange(habit.frequency, d)[0]]?.[habit.id];
}
export function setOverride(habit, on, date = appNow()) {
  const ov = getOverrides();
  const start = periodRange(habit.frequency, date)[0];
  if (on) {
    (ov[start] ||= {})[habit.id] = true;
    store.set('override', ov);
    setExcused(habit, start, false);
    const log = getLog();
    const [s, e] = periodRange(habit.frequency, date);
    const n = Object.keys(log).filter((d) => d >= s && d <= e).reduce((t, d) => t + (log[d][habit.id]?.n || 0), 0);
    const want = habit.frequency === 'daily' ? Math.max(1, habit.target) : 1;
    if (n < want) {
      const today = dayKey(date);
      (log[today] ||= {})[habit.id] = { n: (log[today][habit.id]?.n || 0) + want - n, xp: habit.xp, c: habit.category };
      saveLog(log);
    }
    return;
  }
  if (ov[start]) {
    delete ov[start][habit.id];
    if (!Object.keys(ov[start]).length) delete ov[start];
    store.set('override', ov);
  }
  // Clear the period's ticks; the auto-check puts them back if the other tab says it's earned
  const log = getLog();
  const [s, e] = periodRange(habit.frequency, date);
  for (const d of Object.keys(log)) {
    if (d < s || d > e || !log[d][habit.id]) continue;
    delete log[d][habit.id];
    if (!Object.keys(log[d]).length) delete log[d];
  }
  saveLog(log);
}

// When a habit becomes a limit: its taps this period become plain uses (no XP)
export function clearPeriodXP(habit, date = appNow()) {
  const log = getLog();
  const [start, end] = periodRange(habit.frequency, date);
  for (const day in log) if (day >= start && day <= end && log[day][habit.id]) log[day][habit.id].xp = 0;
  saveLog(log);
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
  if (isOverridden(habit, day)) return false; // ticked by hand: auto leaves it alone
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
  if (isOverridden(habit, date)) return false;
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

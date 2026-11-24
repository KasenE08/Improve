// Habit data + completion history.
//
// Storage (all under the imp_ prefix):
//   imp_schema      number, data format version
//   imp_categories  [{ id, name, icon }]
//   imp_habits      [{ id, name, category, frequency: 'daily', target, xp, order, archived, auto, kind, days,
//                      twoMin, full, cue, craving, response, reward, streakBase }]
//                   Every habit is daily (Nov 23, 2026). kind: 'goal' (default) | 'lift' (sessions, 5 a week) |
//                   'fastfood' (meals; 2 passes a week). days: 'daily' (default) | 'sun' | 'payday'.
//   imp_profile     { name }
//   imp_log         { "YYYY-MM-DD": { habitId: { n: count, xp: xpPerCompletionAtTheTime, c: categoryAtTheTime, min?: true } } }
//                   min = done as the 2-minute version (Minimum); no min = Full. Fast food: n = meals that day.
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
import { MONTHLY_START } from './launch.js';

// Habit kinds: a goal ("do it N times", the default) or a limit ("at most N times", e.g. fast food ≤ 2 a week).
// Taps on a limit habit only count uses (no XP); its XP comes when the period ends at or under the limit (rewards.js).
export const isLimit = (h) => h?.kind === 'limit' || h?.kind === 'fastfood';
export const isFastFood = (h) => h?.kind === 'fastfood' || h?.kind === 'limit';
export const isLift = (h) => h?.kind === 'lift';
/** Has a 2-minute version (Minimum). Habits without one are Full only. */
export const hasMin = (h) => !!(h?.twoMin && String(h.twoMin).trim());
export const MIN = 1, FULL = 2;
// Done for the day: goal reached, or for fast food, still within the week's passes
export const isDone = (h, n) => (isLimit(h) ? n <= h.target : n >= Math.min(1, h.target || 1));
export const LIMIT_MAX_USES = 99;

// Monthly habits wait for the first month after launch (see launch.js)
/** The day a habit starts (greyed out until then): its own startsOn, or for monthly habits the first month. */
export const startOf = (habit) => [habit.startsOn, habit.frequency === 'monthly' ? MONTHLY_START : null].filter(Boolean).sort().pop() || null;
export const notStarted = (habit, date = appNow()) => { const s = startOf(habit); return !!s && dayKey(date) < s; };

export const SCHEMA = 22;
export const FREQS = ['daily', 'weekly', 'monthly'];

// Seeds a fresh install. Returns the schema version found before (0 = fresh),
// so the app can run one-time upgrades. Existing data is never overwritten.
export function init() {
  const found = store.get('schema') ?? 0;
  if (found === 0) {
    store.set('categories', DEFAULT_CATEGORIES);
    // Limit habits are judged from install day on (no payout for weeks before the app was used)
    const today = dayKey(appNow());
    store.set('habits', DEFAULT_HABITS.map((h) => ({ ...h, since: today })));
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
  // Schema 15: Money is a weekly check-in now (no logging each purchase), so "Log spending" becomes
  // the weekly "Sunday money check-in", ticked by the check-in itself.
  if (found > 0 && found < 15) {
    store.set('habits', store.get('habits', []).map((h) => (h.id === 'log-spending' ? { ...h, name: 'Sunday money check-in', frequency: 'weekly', target: 1, auto: 'money:checkin' } : h)));
  }
  // Schema 16 (Nov 2026 habit review): only habits that are still a fight stay. Autopilot ones are
  // archived (history kept), and vague ones are made specific.
  // (Only for the list it was made for: it has the custom "Schedule tomorrow" habit.)
  if (found > 0 && found < 16 && store.get('habits', []).some((h) => h.id === 'h_mvxenssgflmz')) {
    const CUT = ['mobility', 'skincare', 'oral-care', 'h_mvq5mpnq4f3d', 'h_mvzh58ktl5bo', 'h_mvze6zm5awsi', 'h_mw25rarzdrv8',
      'h_mw7e16121614', 'h_mvylw25wy5xn', 'friends', 'family', 'journal', 'water', 'calories', 'protein'];
    const EDIT = {
      sleep: { name: '7+ hrs sleep' },
      h_mvs7ch6mu7ud: { name: 'Start a conversation with someone new', frequency: 'weekly', target: 3 },
      'work-on-schedule': { name: 'Distraction-free work blocks' },
      h_mvxenssgflmz: { name: 'Tomorrow fully scheduled' },
      h_mw4hvp9wfrqm: { name: 'Stay humble' },
      h_mvn3jd67szxn: { target: 2 },
    };
    store.set('habits', store.get('habits', []).map((h) => (CUT.includes(h.id) ? { ...h, archived: true } : EDIT[h.id] ? { ...h, ...EDIT[h.id] } : h)));
  }
  // Schema 17: habits can have a short rule (shown under the name); the reviewed list gets its rules
  if (found > 0 && found < 17 && store.get('habits', []).some((h) => h.id === 'h_mvxenssgflmz')) {
    const RULES = {
      h_mvxenssgflmz: 'No gap over 1 hr · bedtime block set',
      'work-on-schedule': 'Phone in another room · only the task in front of me',
      h_mw4hvp9wfrqm: 'No getting defensive · no judging',
      h_mw4gzesuljy8: 'A real meal, not snacks pieced together',
      h_mvs7ch6mu7ud: "Someone I don't usually talk to",
      h_mvn3jd67szxn: 'Max 2 a week (sodium)',
    };
    store.set('habits', store.get('habits', []).map((h) => (RULES[h.id] && !h.rule ? { ...h, rule: RULES[h.id] } : h)));
  }
  // Schema 18: reading and the Substack post come back (unarchived, history intact)
  if (found > 0 && found < 18 && store.get('habits', []).some((h) => h.id === 'h_mvxenssgflmz')) {
    const BACK = { h_mvze6zm5awsi: 'Read at least 10 pages', h_mw25rarzdrv8: 'Post daily blog on Substack' };
    store.set('habits', store.get('habits', []).map((h) => (BACK[h.id] ? { ...h, archived: false, name: BACK[h.id] } : h)));
  }
  // Schema 19: fresh start for the reviewed list. Streaks of the current habits count from Mon Nov 9, 2026
  // (history, Perfect Days and totals are kept).
  if (found > 0 && found < 19 && store.get('habits', []).some((h) => h.id === 'h_mvxenssgflmz')) {
    store.set('habits', store.get('habits', []).map((h) => (h.archived ? h : { ...h, streakFrom: '2026-11-09' })));
  }
  // Schema 20: the reviewed list's weekly habits start fresh with the week of Mon Nov 9 (greyed out until then)
  if (found > 0 && found < 20 && store.get('habits', []).some((h) => h.id === 'h_mvxenssgflmz')) {
    store.set('habits', store.get('habits', []).map((h) => (!h.archived && h.frequency === 'weekly' ? { ...h, startsOn: '2026-11-09' } : h)));
  }
  // Schema 21: new monthly habit for the reviewed list: a full day off the phone
  if (found > 0 && found < 21 && store.get('habits', []).some((h) => h.id === 'h_mvxenssgflmz')) {
    const all = store.get('habits', []);
    if (!all.some((h) => h.id === 'phone-free-day')) {
      all.push({ id: 'phone-free-day', name: 'One full day off my phone', rule: 'Phone in another room all day', category: 'mind', frequency: 'monthly',
        target: 1, xp: 40, order: all.reduce((m, h) => Math.max(m, h.order + 1), 0), archived: false, auto: null, kind: 'goal' });
      store.set('habits', all);
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

// Completions in the period that matters for the habit: fast food and lift count the Mon–Sun week
// (meals / sessions), everything else the day.
export function progress(habit, date = appNow(), log = getLog()) {
  const [start, end] = periodRange(isLift(habit) || isFastFood(habit) ? 'weekly' : 'daily', date);
  let n = 0;
  for (const day in log) {
    if (day >= start && day <= end && log[day][habit.id]) n += isLift(habit) ? (log[day][habit.id].n > 0 ? 1 : 0) : log[day][habit.id].n;
  }
  return n;
}

/** 0 = not done, 1 = Minimum (2-min version), 2 = Full. */
export function levelOn(habit, day, log = getLog()) {
  const e = log[day]?.[habit.id];
  if (!e || !(e.n > 0)) return 0;
  return e.min ? MIN : FULL;
}
/** Fast food meals logged on a day */
export const usesOn = (habit, day, log = getLog()) => log[day]?.[habit.id]?.n || 0;

/** Set a day to not done / Minimum / Full. Returns true if anything changed. */
export function setLevel(habit, day, level, log = getLog()) {
  if (!hasMin(habit) && level === MIN) level = FULL;
  const cur = levelOn(habit, day, log);
  if (cur === level) return false;
  if (!level) {
    delete log[day][habit.id];
    if (!Object.keys(log[day]).length) delete log[day];
  } else {
    const xp = level === FULL ? habit.xp : Math.round(habit.xp / 2);
    (log[day] ||= {})[habit.id] = { n: 1, xp, c: habit.category, ...(level === MIN ? { min: true } : {}) };
  }
  saveLog(log);
  return true;
}

// +1 = Full today (fast food: one more meal), -1 = undo today (fast food: one meal less, today or earlier this week)
export function step(habit, delta, date = appNow()) {
  const log = getLog();
  const today = dayKey(date);
  if (isFastFood(habit)) {
    if (delta > 0) {
      if (notStarted(habit, date)) return 0;
      const e = ((log[today] ||= {})[habit.id] ||= { n: 0, xp: 0 });
      e.n = Math.min(LIMIT_MAX_USES, e.n + 1);
      e.xp = 0;
      e.c = habit.category;
      saveLog(log);
      return 0; // meals never give XP
    }
    const [start] = periodRange('weekly', date);
    const days = Object.keys(log).filter((d) => d >= start && d <= today && log[d][habit.id]?.n > 0).sort();
    const day = days.includes(today) ? today : days[days.length - 1];
    if (!day) return 0;
    const e = log[day][habit.id];
    e.n -= 1;
    if (e.n <= 0) delete log[day][habit.id];
    if (!Object.keys(log[day]).length) delete log[day];
    saveLog(log);
    return 0;
  }
  if (delta > 0) {
    if (notStarted(habit, date)) return 0;
    return setLevel(habit, today, FULL, log) ? habit.xp : 0;
  }
  const had = log[today]?.[habit.id]?.xp || 0;
  return setLevel(habit, today, 0, log) ? -had : 0;
}

// Days/weeks off: a period a habit had nothing to do ("Finished today's work" with nothing planned,
// "Save from paycheck" in a week with no payday). No tick and no XP, but it doesn't break the streak
// or block Perfect Day. Stored under the period's first day:
//   imp_excused { "YYYY-MM-DD": { habitId: true } }
export const getExcused = () => store.get('excused', {});
export const isExcused = (habitId, day, ex = getExcused()) => !!ex[day]?.[habitId];
export const offIn = (habit, date = appNow(), ex = getExcused()) => isExcused(habit.id, dayKey(date), ex);
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
  const d = typeof date === 'string' ? date : dayKey(date);
  return !!ov[d]?.[habit.id];
}
// on: tick it yourself today at `level` (Full by default); off: hand it back to the auto-check
export function setOverride(habit, on, date = appNow(), level = FULL) {
  const ov = getOverrides();
  const day = typeof date === 'string' ? date : dayKey(date);
  if (on) {
    (ov[day] ||= {})[habit.id] = true;
    store.set('override', ov);
    setExcused(habit, day, false);
    setLevel(habit, day, level);
    return;
  }
  if (ov[day]) {
    delete ov[day][habit.id];
    if (!Object.keys(ov[day]).length) delete ov[day];
    store.set('override', ov);
  }
  setLevel(habit, day, 0); // the auto-check puts it back if the other tab says it's earned
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
  if (startOf(habit) && day < startOf(habit)) return false; // not started yet
  if (habit.autoAfter == null || day < today) return true;
  const late = (m) => (m < DAY_START_MIN ? m + 1440 : m);
  return late(now.getHours() * 60 + now.getMinutes()) >= late(habit.autoAfter);
}

// Set a habit's level on a date from an auto-check (another tab). `level`: 0 / 1 (Minimum) / 2 (Full),
// or true / false for Full / not done. Returns true if anything changed.
export function setDone(habit, day, level, now = new Date()) {
  if (isOverridden(habit, day)) return false; // ticked by hand: auto leaves it alone
  let lv = level === true ? FULL : level === false ? 0 : level || 0;
  if (lv && !autoTimeReached(habit, day, now)) lv = 0;
  return setLevel(habit, day, lv);
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

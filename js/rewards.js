// Streaks and bonus XP.
//
// Every habit is daily (Nov 23, 2026). Each day it's done Full, done Minimum (its 2-minute version), or missed.
//   Full → streak +1 · Minimum → streak holds · Minimum two times in a row → breaks · miss → breaks
// Days a habit isn't scheduled (Sunday-only, payday-only, Lift after 5/5, days off) are skipped.
//   Lift counts sessions: Full +1, Minimum holds, 2 Minimums in a row break, days with no lift don't count,
//        a week that ends under 5 sessions breaks it.
//   Fast food: a day with none → +1, a day with a pass → holds, going past 2 passes in a week → 0.
// Each habit keeps the streak it had before these rules as its starting point (habit.streakBase).
// No XP is ever taken away for a miss.
//
// Bonuses are saved in imp_bonus on the day they're earned, so later habit edits
// never change past bonuses. Today's bonuses are re-checked after every tap, so
// undoing a check-in also removes a bonus it unlocked.

import * as store from './store.js';
import * as H from './habits.js';
import { dayKey, addDays, weekStart, periodRange, appNow, fromDayKey } from './dates.js';
import * as MS from './money/store.js';
import { paydaysBetween } from './money/logic.js';

export const PERFECT_DAY_XP = 100;
export const PERFECT_WEEK_XP = 300;
export const PERFECT_MONTH_XP = 1000;
// Streak milestones (popups) per frequency: [streak length, XP], then every `every` after the last
export const MILESTONES = {
  daily: { at: [[3, 20], [7, 50], [14, 100], [30, 200], [60, 300], [100, 600], [180, 800], [365, 1500]], every: 365 },
  weekly: { at: [[4, 50], [8, 100], [12, 200], [26, 400], [52, 800]], every: 52 },
  monthly: { at: [[3, 100], [6, 300], [12, 800]], every: 12 },
};
export const UNIT = { daily: ['day', 'days'], weekly: ['week', 'weeks'], monthly: ['month', 'months'] };
/** A habit's streak unit: Lift counts sessions, everything else days → ['day', 'days'] */
export const unitOf = (h) => (H.isLift(h) ? ['session', 'sessions'] : UNIT.daily);

export function milestoneXP(n, freq = 'daily') {
  const m = MILESTONES[freq] || MILESTONES.daily;
  for (const [len, xp] of m.at) if (n === len) return xp;
  const last = m.at[m.at.length - 1];
  if (n > last[0] && n % m.every === 0) return last[1]; // every 365 days after that
  return 0;
}

// Flame level 1–4 for a streak (0 = no flame). It steps up at a milestone, so a new flame always comes with a popup.
export const TIERS = { daily: [2, 7, 30, 100], weekly: [2, 4, 12, 52], monthly: [2, 3, 6, 12] };
export function tier(n, freq = 'daily') {
  const t = TIERS[freq] || TIERS.daily;
  let lv = 0;
  t.forEach((min, i) => { if (n >= min) lv = i + 1; });
  return lv;
}
export const isNewTier = (n, freq = 'daily') => (TIERS[freq] || TIERS.daily).slice(1).includes(n);

export const getBonus = () => store.get('bonus', {});
const saveBonus = (b) => store.set('bonus', b);

export function bonusXPOnDay(key = dayKey(), bonus = getBonus()) {
  return Object.values(bonus[key] || {}).reduce((s, b) => s + b.xp, 0);
}

// What the streak and schedule checks read, loaded once per pass
export function makeCtx(log = H.getLog()) {
  const ms = MS.getState();
  return { log, ex: H.getExcused(), pay: ms.settings.setup ? ms.settings.pay : null };
}

const isSunday = (key) => fromDayKey(key).getDay() === 0;
// Lift sessions in the Mon–Sun week of `key`: before that day (or the whole week with all = true)
function liftSessions(h, key, log, all = false) {
  const [s, e] = periodRange('weekly', fromDayKey(key));
  let n = 0;
  for (let d = fromDayKey(s); dayKey(d) <= e; d = addDays(d, 1)) {
    const k = dayKey(d);
    if (!all && k >= key) break;
    if (H.levelOn(h, k, log)) n++;
  }
  return n;
}
const usesBefore = (h, key, log) => {
  const [s] = periodRange('weekly', fromDayKey(key));
  let n = 0;
  for (let d = fromDayKey(s); dayKey(d) < key; d = addDays(d, 1)) n += H.usesOn(h, dayKey(d), log);
  return n;
};
/** Fast food meals this Mon–Sun week, up to and including `date` */
export const passesUsed = (h, date = appNow(), log = H.getLog()) => usesBefore(h, dayKey(date), log) + H.usesOn(h, dayKey(date), log);
/** Lift sessions this Mon–Sun week */
export const liftDone = (h, date = appNow(), log = H.getLog()) => liftSessions(h, dayKey(date), log, true);

/**
 * Does the habit show (and count) on this day? Days off and days before it existed: no.
 * Lift: until the week's 5 sessions are done (and on the day of a session). Sunday / payday habits: those days only.
 */
export function isScheduled(h, key, ctx = makeCtx()) {
  if (H.isExcused(h.id, key, ctx.ex)) return false;
  if (h.since && key < h.since) return false;
  if (h.startsOn && key < h.startsOn) return false;
  if (H.isLift(h)) return liftSessions(h, key, ctx.log) < (h.target || 5) || H.levelOn(h, key, ctx.log) > 0;
  if (h.days === 'sun') return isSunday(key);
  if (h.days === 'payday') return !!ctx.pay && paydaysBetween(ctx.pay, key, key).length > 0;
  return true;
}

const firstLogDay = (h, log) => Object.keys(log).filter((k) => log[k][h.id]).sort()[0] || null;

/**
 * → { count, current: done Full today, level: today's level (fast food: meals today), atRisk, min }
 * atRisk: the streak is alive but today could break it (yesterday was a Minimum: do Full; fast food: no passes left).
 */
export function streak(h, date = appNow(), _counts = null, ctx = makeCtx()) {
  const log = ctx.log;
  const today = dayKey(date);
  const base = h.streakBase || null;
  let count = base?.count || 0, lastMin = !!base?.min, atRisk = false;
  const start = base ? dayKey(addDays(fromDayKey(base.day), 1)) : (h.since || firstLogDay(h, log) || today);
  const lift = H.isLift(h), ff = H.isFastFood(h);
  let weekUses = 0;
  for (let d = fromDayKey(start); dayKey(d) <= today; d = addDays(d, 1)) {
    const k = dayKey(d);
    if (ff) {
      if (k === start || fromDayKey(k).getDay() === 1) weekUses = usesBefore(h, k, log);
      if (H.isExcused(h.id, k, ctx.ex)) continue;
      const u = H.usesOn(h, k, log);
      weekUses += u;
      if (u > 0 && weekUses > h.target) count = 0; // past the week's passes
      else if (k !== today && u === 0) count++;
      // a day with a pass holds; today counts once it's over
      continue;
    }
    if (isScheduled(h, k, ctx)) {
      const lv = H.levelOn(h, k, log);
      if (k === today && !lv) atRisk = lastMin && count > 0; // still time today
      else if (lv === H.FULL) { count++; lastMin = false; }
      else if (lv === H.MIN) { if (lastMin) count = 0; lastMin = true; }
      else if (!lift) { count = 0; lastMin = false; } // a missed day (a day with no lift doesn't count)
    }
    if (lift && isSunday(k) && k < today && liftSessions(h, k, log, true) < (h.target || 5)) { count = 0; lastMin = false; }
  }
  if (ff) {
    const left = h.target - passesUsed(h, date, log);
    return { count, current: false, level: H.usesOn(h, today, log), atRisk: count > 0 && left <= 0, min: false, passesLeft: left };
  }
  const level = H.levelOn(h, today, log);
  return { count, current: level === H.FULL, level, atRisk, min: lastMin };
}

/** Today counts as a Perfect Day: every habit showing today done Full (Lift only if a session was logged; fast food: none today). */
export function perfectOn(key, habits = H.getHabits(), ctx = makeCtx()) {
  let n = 0;
  for (const h of habits) {
    if (H.isFastFood(h)) { if (H.isExcused(h.id, key, ctx.ex)) continue; if (H.usesOn(h, key, ctx.log) > 0) return false; n++; continue; }
    if (!isScheduled(h, key, ctx)) continue;
    const lv = H.levelOn(h, key, ctx.log);
    if (H.isLift(h) && !lv) continue;
    if (lv !== H.FULL) return false;
    n++;
  }
  return n > 0;
}

// Re-check today's bonuses. Returns the bonuses newly added (for notifications).
export function sync(date = appNow()) {
  const today = dayKey(date);
  const habits = H.getHabits();
  const ctx = makeCtx();
  const bonus = getBonus();
  const added = [];
  const day = (bonus[today] ||= {});

  // Perfect Day: every habit showing today done Full (a single Minimum and it isn't)
  const perfect = perfectOn(today, habits, ctx);
  if (perfect && !day.perfect) { day.perfect = { type: 'perfect', xp: PERFECT_DAY_XP }; added.push(day.perfect); }
  if (!perfect) delete day.perfect;

  // Perfect Week: Mon–Sun all Perfect Days (earned on Sunday). Perfect Month: every day of the calendar month (earned on the last day).
  const [ws, we] = periodRange('weekly', date);
  if (perfect && today === we && allPerfect(bonus, ws, we)) {
    if (!day.perfectWeek) { day.perfectWeek = { type: 'perfectWeek', xp: PERFECT_WEEK_XP, from: ws, to: we }; added.push(day.perfectWeek); }
  } else delete day.perfectWeek;
  const [ms, me] = periodRange('monthly', date);
  if (perfect && today === me && allPerfect(bonus, ms, me)) {
    if (!day.perfectMonth) { day.perfectMonth = { type: 'perfectMonth', xp: PERFECT_MONTH_XP, from: ms, to: me }; added.push(day.perfectMonth); }
  } else delete day.perfectMonth;

  // Streak milestones (3, 7, 14, 30, 60, 100, 180, 365): once per streak length, on the day it's reached
  const recent = dayKey(addDays(date, -14));
  for (const h of habits) {
    const id = 'streak:' + h.id;
    const st = streak(h, date, null, ctx);
    const xp = st.current || H.isFastFood(h) ? milestoneXP(st.count) : 0;
    const holder = Object.keys(bonus).find((k) => k >= recent && k <= today && bonus[k][id]?.n === st.count);
    if (xp && !holder) {
      day[id] = { type: 'streak', habit: h.id, name: h.name, n: st.count, unit: unitOf(h)[1], xp, c: h.category };
      added.push(day[id]);
    } else if (!xp && day[id]) {
      delete day[id]; // undone today
    }
  }

  for (const k in bonus) if (!Object.keys(bonus[k]).length) delete bonus[k];
  saveBonus(bonus);
  return added;
}

// Every day from..to (day keys) is a Perfect Day
export function allPerfect(bonus, from, to) {
  for (let d = fromDayKey(from); dayKey(d) <= to; d = addDays(d, 1)) if (!bonus[dayKey(d)]?.perfect) return false;
  return true;
}

// Totals for the You tab: Perfect Days, complete Mon–Sun weeks and complete calendar months of them
export function perfectCounts(bonus = getBonus()) {
  const keys = Object.keys(bonus).filter((k) => bonus[k].perfect);
  const weeks = {}, months = {};
  for (const k of keys) {
    const w = periodRange('weekly', fromDayKey(k))[0];
    weeks[w] = (weeks[w] || 0) + 1;
    const m = k.slice(0, 7);
    months[m] = (months[m] || 0) + 1;
  }
  const daysIn = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
  return {
    days: keys.length,
    weeks: Object.values(weeks).filter((n) => n === 7).length,
    months: Object.keys(months).filter((m) => months[m] === daysIn(m)).length,
  };
}

// One-time upgrade from Phase 1: award Perfect Days already earned in the history
export function awardPastPerfectDays(date = appNow()) {
  const today = dayKey(date);
  const dailies = H.getHabits().filter((h) => h.frequency === 'daily');
  if (!dailies.length) return;
  const log = H.getLog();
  const bonus = getBonus();
  for (const k in log) {
    if (k >= today) continue;
    if (dailies.every((h) => H.isDone(h, log[k][h.id]?.n || 0))) (bonus[k] ||= {}).perfect = { type: 'perfect', xp: PERFECT_DAY_XP };
  }
  saveBonus(bonus);
}

// Current streaks for every active habit, longest first
export function allStreaks(date = appNow()) {
  const ctx = makeCtx();
  return H.getHabits()
    .map((h) => ({ h, ...streak(h, date, null, ctx) }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
}


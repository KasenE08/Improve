// Streaks and bonus XP.
//
// Streak = consecutive completed periods (days for daily habits, Mon–Sun weeks
// for weekly, months for monthly). If the current period isn't done yet the
// streak is still alive and shows the previous run. Missing a period resets it.
// No XP is ever taken away for a miss.
//
// Bonuses are saved in imp_bonus on the day they're earned, so later habit edits
// never change past bonuses. Today's bonuses are re-checked after every tap, so
// undoing a check-in also removes a bonus it unlocked.

import * as store from './store.js';
import * as H from './habits.js';
import { dayKey, addDays, weekStart, periodRange } from './dates.js';

export const PERFECT_DAY_XP = 50;
export const MILESTONES = [[7, 25], [30, 100], [100, 300]]; // [streak length, XP]
export const UNIT = { daily: ['day', 'days'], weekly: ['week', 'weeks'], monthly: ['month', 'months'] };

export function milestoneXP(n) {
  for (const [len, xp] of MILESTONES) if (n === len) return xp;
  if (n > 100 && n % 100 === 0) return 300; // every 100 after that
  return 0;
}

export const getBonus = () => store.get('bonus', {});
const saveBonus = (b) => store.set('bonus', b);

export function bonusXPOnDay(key = dayKey(), bonus = getBonus()) {
  return Object.values(bonus[key] || {}).reduce((s, b) => s + b.xp, 0);
}

function prevPeriod(freq, d) {
  if (freq === 'weekly') return addDays(weekStart(d), -1);
  if (freq === 'monthly') return new Date(d.getFullYear(), d.getMonth(), 0);
  return addDays(d, -1);
}

function doneIn(h, d, counts) {
  const days = counts[h.id];
  if (!days) return 0;
  if (h.frequency === 'daily') return days[dayKey(d)] || 0;
  const [s, e] = periodRange(h.frequency, d);
  let n = 0;
  for (const k in days) if (k >= s && k <= e) n += days[k];
  return n;
}

// → { count, current: is this period already done }
export function streak(h, date = new Date(), counts = H.countsIndex()) {
  const current = doneIn(h, date, counts) >= h.target;
  let count = current ? 1 : 0;
  let d = prevPeriod(h.frequency, date);
  for (let i = 0; i < 5000 && doneIn(h, d, counts) >= h.target; i++) {
    count++;
    d = prevPeriod(h.frequency, d);
  }
  return { count, current };
}

// Re-check today's bonuses. Returns the bonuses newly added (for notifications).
export function sync(date = new Date()) {
  const today = dayKey(date);
  const counts = H.countsIndex();
  const habits = H.getHabits();
  const bonus = getBonus();
  const added = [];
  const day = (bonus[today] ||= {});

  // Perfect Day: every active daily habit done today
  const dailies = habits.filter((h) => h.frequency === 'daily');
  const perfect = dailies.length > 0 && dailies.every((h) => (counts[h.id]?.[today] || 0) >= h.target);
  if (perfect && !day.perfect) { day.perfect = { type: 'perfect', xp: PERFECT_DAY_XP }; added.push(day.perfect); }
  if (!perfect) delete day.perfect;

  // Streak milestones, one per habit per period
  for (const h of habits) {
    const id = 'streak:' + h.id;
    const [start] = periodRange(h.frequency, date);
    const holder = Object.keys(bonus).find((k) => k >= start && k <= today && bonus[k][id]);
    const { count, current } = streak(h, date, counts);
    const xp = current ? milestoneXP(count) : 0;
    if (xp && !holder) {
      day[id] = { type: 'streak', habit: h.id, name: h.name, n: count, unit: UNIT[h.frequency][1], xp, c: h.category };
      added.push(day[id]);
    } else if (!xp && holder) {
      delete bonus[holder][id];
    }
  }

  for (const k in bonus) if (!Object.keys(bonus[k]).length) delete bonus[k];
  saveBonus(bonus);
  return added;
}

// One-time upgrade from Phase 1: award Perfect Days already earned in the history
export function awardPastPerfectDays(date = new Date()) {
  const today = dayKey(date);
  const dailies = H.getHabits().filter((h) => h.frequency === 'daily');
  if (!dailies.length) return;
  const log = H.getLog();
  const bonus = getBonus();
  for (const k in log) {
    if (k >= today) continue;
    if (dailies.every((h) => (log[k][h.id]?.n || 0) >= h.target)) (bonus[k] ||= {}).perfect = { type: 'perfect', xp: PERFECT_DAY_XP };
  }
  saveBonus(bonus);
}

// Current streaks for every active habit, longest first
export function allStreaks(date = new Date()) {
  const counts = H.countsIndex();
  return H.getHabits()
    .map((h) => ({ h, ...streak(h, date, counts) }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
}


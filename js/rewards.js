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
import { dayKey, addDays, weekStart, periodRange, appNow, fromDayKey } from './dates.js';
import { START, MONTHLY_START } from './launch.js';

export const PERFECT_DAY_XP = 100;
export const MILESTONES = [[7, 50], [30, 200], [100, 600]]; // [streak length, XP]
export const UNIT = { daily: ['day', 'days'], weekly: ['week', 'weeks'], monthly: ['month', 'months'] };

export function milestoneXP(n) {
  for (const [len, xp] of MILESTONES) if (n === len) return xp;
  if (n > 100 && n % 100 === 0) return MILESTONES[2][1]; // every 100 after that
  return 0;
}

export const getBonus = () => store.get('bonus', {});
const saveBonus = (b) => store.set('bonus', b);

export function bonusXPOnDay(key = dayKey(), bonus = getBonus()) {
  return Object.values(bonus[key] || {}).reduce((s, b) => s + b.xp, 0);
}

// A day in the period before the one containing d
function prevPeriod(freq, d) {
  if (freq === 'daily') return addDays(d, -1);
  return addDays(fromDayKey(periodRange(freq, d)[0]), -1);
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

// Consecutive limit periods that earned their XP, counting back from the period containing d
function limitRun(h, d, bonus = getBonus()) {
  let n = 0;
  for (let i = 0; i < 5000; i++) {
    const [s, e] = periodRange(h.frequency, d);
    if (!bonus[e]?.['limit:' + h.id]) break;
    n++;
    d = addDays(fromDayKey(s), -1);
  }
  return n;
}

// → { count, current: is this period already done }
// Limit habits: finished periods kept at or under the limit; the current one is never "done" until it ends.
export function streak(h, date = appNow(), counts = H.countsIndex()) {
  if (H.isLimit(h)) return { count: limitRun(h, prevPeriod(h.frequency, date)), current: false };
  const ex = H.getExcused();
  const off = (d) => h.frequency === 'daily' && H.isExcused(h.id, dayKey(d), ex); // days off are skipped
  const current = doneIn(h, date, counts) >= h.target;
  let count = current ? 1 : 0;
  let d = prevPeriod(h.frequency, date);
  for (let i = 0; i < 5000; i++) {
    if (doneIn(h, d, counts) >= h.target) count++;
    else if (!off(d)) break;
    d = prevPeriod(h.frequency, d);
  }
  return { count, current };
}

// Re-check today's bonuses. Returns the bonuses newly added (for notifications).
export function sync(date = appNow()) {
  const today = dayKey(date);
  const counts = H.countsIndex();
  const habits = H.getHabits();
  const bonus = getBonus();
  const added = [];
  const day = (bonus[today] ||= {});

  // Perfect Day: every active daily habit done today
  added.push(...settleLimits(date, bonus));
  const dailies = habits.filter((h) => h.frequency === 'daily');
  const ex = H.getExcused();
  const perfect = dailies.length > 0 && dailies.every((h) => H.isDone(h, counts[h.id]?.[today] || 0) || H.isExcused(h.id, today, ex));
  if (perfect && !day.perfect) { day.perfect = { type: 'perfect', xp: PERFECT_DAY_XP }; added.push(day.perfect); }
  if (!perfect) delete day.perfect;

  // Streak milestones, one per habit per period
  for (const h of habits) {
    if (H.isLimit(h)) continue; // limit milestones are added when a period is settled
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

// Limit habits ("at most N times"): once a period is over, it earns the habit's XP if uses stayed
// at or under the limit, credited to the period's last day (bonus "limit:<id>"). Going over earns nothing
// and loses nothing. Each period is judged once (imp_limit_settled remembers the last one judged), starting
// from launch day (monthly: the first full habit month) or when the habit became a limit.
// Returns the bonuses added (for celebrations).
export function settleLimits(date = appNow(), bonus = getBonus()) {
  const today = dayKey(date);
  const settled = store.get('limit_settled', {});
  const log = H.getLog();
  const added = [];
  for (const h of H.getHabits().filter(H.isLimit)) {
    const next = settled[h.id] ? dayKey(addDays(fromDayKey(settled[h.id]), 1)) : null;
    const from = [next, h.limitSince, START, h.frequency === 'monthly' ? MONTHLY_START : null].filter(Boolean).sort().pop();
    let d = fromDayKey(from);
    for (let i = 0; i < 1000; i++) {
      const [, e] = periodRange(h.frequency, d);
      if (e >= today) break; // period not over yet
      const uses = H.progress(h, d, log);
      if (uses <= h.target) {
        const day = (bonus[e] ||= {});
        const id = 'limit:' + h.id;
        if (!day[id]) {
          day[id] = { type: 'limit', habit: h.id, name: h.name, n: uses, max: h.target, unit: UNIT[h.frequency][0], xp: h.xp, c: h.category };
          added.push(day[id]);
          const run = limitRun(h, fromDayKey(e), bonus);
          const mx = milestoneXP(run);
          if (mx && !day['streak:' + h.id]) {
            day['streak:' + h.id] = { type: 'streak', habit: h.id, name: h.name, n: run, unit: UNIT[h.frequency][1], xp: mx, c: h.category };
            added.push(day['streak:' + h.id]);
          }
        }
      }
      settled[h.id] = e;
      d = addDays(fromDayKey(e), 1);
    }
  }
  store.set('limit_settled', settled);
  return added;
}

// Current streaks for every active habit, longest first
export function allStreaks(date = appNow()) {
  const counts = H.countsIndex();
  return H.getHabits()
    .map((h) => ({ h, ...streak(h, date, counts) }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
}


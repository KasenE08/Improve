// Streaks and bonus XP.
//
// Streak = consecutive completed periods (days for daily habits, Mon–Sun weeks
// for weekly, months for monthly). If the current period isn't done yet the
// streak is still alive and shows the previous run. Weekly and monthly: missing a
// period resets it. Daily (grace day on, the default): one missed day doesn't count but doesn't
// break it either; two missed days in a row do (days off are skipped, not misses). Grace day off: one miss resets it.
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
export const PERFECT_WEEK_XP = 300;
export const PERFECT_MONTH_XP = 1000;
// Streak milestones (popups) per frequency: [streak length, XP], then every `every` after the last
export const MILESTONES = {
  daily: { at: [[3, 20], [7, 50], [14, 100], [30, 200], [50, 300], [100, 600]], every: 100 },
  weekly: { at: [[4, 50], [8, 100], [12, 200], [26, 400], [52, 800]], every: 52 },
  monthly: { at: [[3, 100], [6, 300], [12, 800]], every: 12 },
};
export const UNIT = { daily: ['day', 'days'], weekly: ['week', 'weeks'], monthly: ['month', 'months'] };

export function milestoneXP(n, freq = 'daily') {
  const m = MILESTONES[freq] || MILESTONES.daily;
  for (const [len, xp] of m.at) if (n === len) return xp;
  const last = m.at[m.at.length - 1];
  if (n > last[0] && n % m.every === 0) return last[1]; // every 100 days / 52 weeks / 12 months after that
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

// Grace day (daily habits only, on unless turned off in the habit): one missed day doesn't break the streak
export const hasGrace = (h) => h.frequency === 'daily' && h.grace !== false;

// Limit periods that earned their XP, counting back from the period containing d.
// Daily limits with a grace day: one day over doesn't break the run, two days over in a row do.
function limitRun(h, d, bonus = getBonus()) {
  const grace = hasGrace(h);
  const ex = grace ? H.getExcused() : null;
  let n = 0, miss = 0;
  for (let i = 0; i < 5000; i++) {
    const [s, e] = periodRange(h.frequency, d);
    if (h.streakFrom && s < h.streakFrom) break; // streak was reset
    if (bonus[e]?.['limit:' + h.id]) { n++; miss = 0; }
    else if (!grace) break;
    else if (!H.offIn(h, d, ex) && ++miss >= 2) break;
    d = addDays(fromDayKey(s), -1);
  }
  return n;
}

// Was the last counted day before `date` a miss? (daily only: the streak is alive but one more miss ends it)
function missedLast(h, date, hit) {
  const ex = H.getExcused();
  let d = addDays(date, -1);
  for (let i = 0; i < 400; i++) {
    if (h.streakFrom && dayKey(d) < h.streakFrom) return false;
    if (hit(d)) return false;
    if (!H.offIn(h, d, ex)) return true;
    d = addDays(d, -1);
  }
  return false;
}

// → { count, current: is this period already done, atRisk: daily streak alive after a missed day }
// Limit habits: finished periods kept at or under the limit; the current one is never "done" until it ends.
export function streak(h, date = appNow(), counts = H.countsIndex()) {
  const grace = hasGrace(h); // daily habit with the grace day on
  if (H.isLimit(h)) {
    const bonus = getBonus();
    const count = limitRun(h, prevPeriod(h.frequency, date), bonus);
    const atRisk = grace && count > 0 && missedLast(h, date, (d) => !!bonus[dayKey(d)]?.['limit:' + h.id]);
    return { count, current: false, atRisk };
  }
  const ex = H.getExcused();
  const off = (d) => H.offIn(h, d, ex); // days/weeks off are skipped
  // A reset streak (streakFrom) only counts periods that start on or after that day
  const counted = (d) => !h.streakFrom || periodRange(h.frequency, d)[0] >= h.streakFrom;
  const hit = (d) => doneIn(h, d, counts) >= h.target;
  const current = counted(date) && hit(date);
  let count = current ? 1 : 0, miss = 0;
  let d = prevPeriod(h.frequency, date);
  for (let i = 0; i < 5000; i++) {
    if (!counted(d)) break;
    if (hit(d)) { count++; miss = 0; }
    else if (!off(d) && (!grace || ++miss >= 2)) break;
    d = prevPeriod(h.frequency, d);
  }
  const atRisk = grace && !current && count > 0 && missedLast(h, date, hit);
  return { count, current, atRisk };
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

  // Perfect Week: Mon–Sun all Perfect Days (earned on Sunday). Perfect Month: every day of the calendar month (earned on the last day).
  const [ws, we] = periodRange('weekly', date);
  if (perfect && today === we && allPerfect(bonus, ws, we)) {
    if (!day.perfectWeek) { day.perfectWeek = { type: 'perfectWeek', xp: PERFECT_WEEK_XP, from: ws, to: we }; added.push(day.perfectWeek); }
  } else delete day.perfectWeek;
  const [ms, me] = periodRange('monthly', date);
  if (perfect && today === me && allPerfect(bonus, ms, me)) {
    if (!day.perfectMonth) { day.perfectMonth = { type: 'perfectMonth', xp: PERFECT_MONTH_XP, from: ms, to: me }; added.push(day.perfectMonth); }
  } else delete day.perfectMonth;

  // Streak milestones, one per habit per period
  for (const h of habits) {
    if (H.isLimit(h)) continue; // limit milestones are added when a period is settled
    const id = 'streak:' + h.id;
    const [start] = periodRange(h.frequency, date);
    const holder = Object.keys(bonus).find((k) => k >= start && k <= today && bonus[k][id]);
    const { count, current } = streak(h, date, counts);
    const xp = current ? milestoneXP(count, h.frequency) : 0;
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
          const mx = milestoneXP(run, h.frequency);
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


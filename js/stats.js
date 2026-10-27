// Everything the three XP meters need, calculated from the saved history.
import * as H from './habits.js';
import * as R from './rewards.js';
import { levelFromXP, getRanks, rankFor, nextRank } from './levels.js';
import { dayKey, appNow } from './dates.js';

const WEEKLY_FACTOR = { daily: 7, weekly: 1, monthly: 12 / 52 };

// XP each category can earn in an average week with the current habits
export function weeklyPotential(habits = H.getHabits()) {
  const byCat = {};
  let total = 0;
  for (const h of habits) {
    const v = h.xp * (H.isLimit(h) ? 1 : h.target) * WEEKLY_FACTOR[h.frequency]; // a limit pays once per period
    byCat[h.category] = (byCat[h.category] || 0) + v;
    total += v;
  }
  return { byCat, total };
}

export function compute() {
  const all = H.getAllHabits();
  const byId = new Map(all.map((h) => [h.id, h]));
  const log = H.getLog();
  const bonus = R.getBonus();
  const cats = H.getCategories();

  let total = 0, checkins = 0, perfectDays = 0;
  const catXP = {};
  for (const day in log) {
    for (const id in log[day]) {
      const e = log[day][id];
      const xp = e.n * e.xp;
      const c = e.c || byId.get(id)?.category;
      total += xp;
      if (!H.isLimit(byId.get(id))) checkins += e.n; // limit taps count uses (e.g. fast food meals), not check-ins
      if (c) catXP[c] = (catXP[c] || 0) + xp;
    }
  }
  for (const day in bonus) {
    for (const b of Object.values(bonus[day])) {
      total += b.xp;
      if (b.c) catXP[b.c] = (catXP[b.c] || 0) + b.xp;
      if (b.type === 'perfect') perfectDays++;
    }
  }

  const ranks = getRanks();
  const overall = levelFromXP(total);
  const pot = weeklyPotential();
  const categories = cats.map((c) => {
    const share = pot.total > 0 && pot.byCat[c.id] ? pot.byCat[c.id] / pot.total : 1 / Math.max(1, cats.length);
    const xp = catXP[c.id] || 0;
    return { ...c, xp, scale: share, ...levelFromXP(xp, share) };
  });

  return {
    total, checkins, perfectDays, overall,
    rank: rankFor(overall.level, ranks), next: nextRank(overall.level, ranks), ranks,
    categories,
  };
}

// Daily meter: XP earned today vs. the most you could earn today
export function today(date = appNow()) {
  const key = dayKey(date);
  const log = H.getLog();
  const byId = new Map(H.getAllHabits().map((h) => [h.id, h]));
  const habitXP = H.xpOnDay(key, log);
  const bonusXP = R.bonusXPOnDay(key);
  // Daily limits pay out after the day ends, so they're not part of today's meter
  const dailyMax = H.getHabits().filter((h) => h.frequency === 'daily' && !H.isLimit(h)).reduce((s, h) => s + h.xp * h.target, 0);
  const extra = Object.entries(log[key] || {}).reduce((s, [id, e]) => (byId.get(id)?.frequency === 'daily' ? s : s + e.n * e.xp), 0);
  const earned = habitXP + bonusXP;
  return { earned, max: dailyMax + extra + bonusXP, bonusXP };
}

// Level curve + ranks.
//
// XP needed to go from level L to L+1 = scale × (BASE + STEP × (L − 1)).
// Overall level uses scale 1. Each category uses a smaller scale equal to its
// share of the XP you can earn, so equal consistency = equal pace in every category.
// Levels are always calculated from XP, never stored, so changing these numbers
// later re-levels everything instantly without touching saved data.

import * as store from './store.js';

export const BASE = 150;
export const STEP = 30;

export const need = (level, scale = 1) => scale * (BASE + STEP * (level - 1));

// → { level, into: XP into this level, need: XP for this level, pct }
export function levelFromXP(xp, scale = 1) {
  let level = 1;
  let left = Math.max(0, xp);
  for (;;) {
    const n = need(level, scale);
    if (left < n || level >= 999) return { level, into: left, need: n, pct: Math.floor((left / n) * 100) };
    left -= n;
    level += 1;
  }
}

// Total XP required to reach a level (from 0)
export const xpToReach = (level, scale = 1) => {
  let t = 0;
  for (let l = 1; l < level; l++) t += need(l, scale);
  return t;
};

export const DEFAULT_RANKS = [
  { min: 1, name: 'Initiate' },
  { min: 5, name: 'Apprentice' },
  { min: 10, name: 'Adept' },
  { min: 20, name: 'Veteran' },
  { min: 30, name: 'Elite' },
  { min: 40, name: 'Master' },
  { min: 50, name: 'Legend' },
  { min: 75, name: 'Mythic' },
  { min: 100, name: 'Ascended' },
];

export const getRanks = () => [...store.get('ranks', DEFAULT_RANKS)].sort((a, b) => a.min - b.min);
export const saveRanks = (r) => store.set('ranks', [...r].sort((a, b) => a.min - b.min));

export function rankFor(level, ranks = getRanks()) {
  let r = ranks[0] || { min: 1, name: 'Initiate' };
  for (const x of ranks) if (level >= x.min) r = x;
  return r;
}

export function nextRank(level, ranks = getRanks()) {
  return ranks.find((x) => x.min > level) || null;
}

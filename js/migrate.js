// One-time upgrade to schema 22 (Nov 23, 2026): the Atomic Habits overhaul.
//   - every habit becomes daily (some only show on some days), with a 2-minute Minimum and a Full version
//   - the reviewed list gets its content (cue / craving / response / reward / 2-min / full)
//   - habits not on the new list are removed (archived: their history stays)
//   - each habit keeps the streak it had, frozen as its starting point (streakBase); the new rules count from today
//   - protein goal 130 g (Minimum 105 g), water Minimum 80 oz, calories Minimum 1,980–2,700, journal Minimum 25 words
// The old streak rules live here only to work out those starting counts.
import * as store from './store.js';
import * as H from './habits.js';
import { HABIT_CONTENT, CONTENT_FIELDS } from './defaults.js';
import { dayKey, addDays, fromDayKey, periodRange, appNow } from './dates.js';

// ---- The old streak rules (before Nov 23, 2026) ----
const prevPeriod = (freq, d) => (freq === 'daily' ? addDays(d, -1) : addDays(fromDayKey(periodRange(freq, d)[0]), -1));
function doneIn(h, d, counts) {
  const days = counts[h.id];
  if (!days) return 0;
  if (h.frequency === 'daily') return days[dayKey(d)] || 0;
  const [s, e] = periodRange(h.frequency, d);
  let n = 0;
  for (const k in days) if (k >= s && k <= e) n += days[k];
  return n;
}
const oldOff = (h, d, ex) => !!ex[periodRange(h.frequency, d)[0]]?.[h.id];
const oldGrace = (h) => h.frequency === 'daily' && h.grace !== false;
function limitRun(h, d, bonus, ex) {
  const grace = oldGrace(h);
  let n = 0, miss = 0;
  for (let i = 0; i < 5000; i++) {
    const [s, e] = periodRange(h.frequency, d);
    if (h.streakFrom && s < h.streakFrom) break;
    if (bonus[e]?.['limit:' + h.id]) { n++; miss = 0; }
    else if (!grace) break;
    else if (!oldOff(h, d, ex) && ++miss >= 2) break;
    d = addDays(fromDayKey(s), -1);
  }
  return n;
}
/** The streak a habit had under the old rules → { count, current } */
export function legacyStreak(h, date, { counts, bonus, ex }) {
  if (h.kind === 'limit') return { count: limitRun(h, prevPeriod(h.frequency, date), bonus, ex), current: false };
  const grace = oldGrace(h);
  const counted = (d) => !h.streakFrom || periodRange(h.frequency, d)[0] >= h.streakFrom;
  const hit = (d) => doneIn(h, d, counts) >= h.target;
  const current = counted(date) && hit(date);
  let count = current ? 1 : 0, miss = 0;
  let d = prevPeriod(h.frequency, date);
  for (let i = 0; i < 5000; i++) {
    if (!counted(d)) break;
    if (hit(d)) { count++; miss = 0; }
    else if (!oldOff(h, d, ex) && (!grace || ++miss >= 2)) break;
    d = prevPeriod(h.frequency, d);
  }
  return { count, current };
}

// This phone's habit ids → the new list (anything else on this phone is removed)
const MINE = {
  sleep: 'sleep', steps: 'steps', h_mwei4zi6qxno: 'stretching', h_mwe9ovu6lfwv: 'water', h_mwe9ptqnyvog: 'protein',
  h_mwhfkr7v1em7: 'calories', 'no-fap': 'no-tv', h_mvze6zm5awsi: 'read', h_mwat29q9cfn1: 'journal', h_mwei4ef01mcb: 'make-bed',
  h_mw25rarzdrv8: 'ai-post', lift: 'lift', h_mvn3jd67szxn: 'fast-food', 'log-spending': 'log-spending', 'save-paycheck': 'save-paycheck',
};
// Other installs: match by the auto source or the built-in id
const BY_AUTO = { 'food:water': 'water', 'food:protein': 'protein', 'food:calories': 'calories', 'journal:words': 'journal', 'money:checkin': 'log-spending', 'money:save': 'save-paycheck' };

export function migrate22(now = new Date()) {
  const date = appNow(now);
  const yesterday = dayKey(addDays(date, -1));
  const today = dayKey(date);
  const counts = H.countsIndex(store.get('log', {}));
  const ctx = { counts, bonus: store.get('bonus', {}), ex: store.get('excused', {}) };
  const all = store.get('habits', []);
  const mine = all.some((h) => h.id === 'h_mw25rarzdrv8');
  const content = Object.fromEntries(HABIT_CONTENT.map((c) => [c.key, c]));
  const used = new Set();

  const out = all.map((h) => {
    if (h.archived) return h;
    const key = mine ? MINE[h.id] : (content[h.id] ? h.id : BY_AUTO[h.auto]) || (h.kind === 'limit' ? 'fast-food' : null);
    if (mine && !key) return { ...h, archived: true }; // not on the new list
    // Keep the streak it has: the old count, minus today's / this week's part (the new rules count that again)
    const old = legacyStreak(h, date, ctx);
    const streakBase = { count: Math.max(0, old.count - (old.current ? 1 : 0)), day: yesterday, min: false };
    const next = { ...h, frequency: 'daily', streakBase };
    for (const k of ['grace', 'streakFrom', 'startsOn', 'limitSince']) delete next[k];
    if (key && !used.has(key)) {
      used.add(key);
      const c = content[key];
      for (const f of CONTENT_FIELDS) if (f !== 'category') next[f] = c[f] ?? (f === 'kind' ? 'goal' : f === 'days' ? 'daily' : f === 'target' ? 1 : null);
      if (!next.auto && h.auto) next.auto = h.auto;
      if (c.auto) next.auto = c.auto;
    } else {
      next.kind = h.kind === 'limit' ? 'fastfood' : 'goal';
      next.target = next.kind === 'fastfood' ? h.target : 1;
      next.days = 'daily';
    }
    return next;
  });
  store.set('habits', out);

  // Goals for the Minimum / Full levels
  const food = store.get('food', null);
  if (food) {
    food.settings = { ...food.settings, proteinGoal: 130, proteinMin: 105, waterMin: 80, calMax: 2700 };
    store.set('food', food);
  }
  const journal = store.get('journal', null);
  if (journal) {
    journal.settings = { ...journal.settings, minWords: 100, shortWords: 25 };
    store.set('journal', journal);
  }
  return today;
}

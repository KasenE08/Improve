// "Finished today's work": ticks when every assignment that's today's work was done on time:
//   - started (Start tapped) no later than 10 minutes after its planned time (early is fine),
//   - finished by its due time,
//   - and "Falling behind" wasn't used today.
// Dragging an assignment to a new time or day is fine: the new time is the one that counts.
// Reads the Planner tab's saved data (imp_planner) directly, so it works without opening the tab.
//
// Today's work (the app day, 4:01 AM → 4:00 AM) is:
//   - everything the planner currently has on today,
//   - anything whose planned time already came today (locked in, so "Falling behind" pushing it
//     to tomorrow doesn't count as finishing it), and
//   - anything finished today.
// A task the planner moves off today before its time comes simply drops off. Deleted tasks drop off.
// Nothing at all = a day off (no tick, no XP; streak and Perfect Day unaffected), once the planner
// has tasks or fixed times. Locked-in tasks are kept in imp_planner_day { date, locked, starts },
// where starts[id] = { at, seen }: the planned start when its time came (refreshed after a drag).
import * as store from './store.js';
import * as H from './habits.js';
import * as R from './rewards.js';
import { dayKey, appNow } from './dates.js';

export const START_GRACE_MIN = 10;

/** Done on time: started within 10 minutes of its planned time and finished by its due time. */
export function onTime(t, rec) {
  if (!t || t.status !== 'done' || t.startedAt == null) return false;
  if (t.due != null && t.completedAt != null && t.completedAt > t.due) return false;
  return !rec || t.startedAt <= rec.at + START_GRACE_MIN * 60000;
}

// date: a moment in the app day being judged; now: the real current time
export function plannerHit(data, date = appNow(), now = new Date()) {
  const today = dayKey(date);
  const nowMs = now.getTime();
  const tasks = new Map((data.tasks || []).map((t) => [t.id, t]));
  let day = store.get('planner_day', null);
  if (!day || day.date !== today || !Array.isArray(day.locked)) day = { date: today, locked: [] }; // older saves: start fresh
  day.starts ||= {};
  const lock = (id) => { if (!day.locked.includes(id)) day.locked.push(id); };
  const dragged = (id) => data.dragAt && day.starts[id] && data.dragAt > day.starts[id].seen;
  const planned = [];
  const items = new Map();
  for (const i of data.plan?.items || []) {
    if (dayKey(appNow(new Date(i.start))) !== today) continue; // 12–2am work counts for the night before
    items.set(i.taskId, i);
    planned.push(i.taskId);
    if (i.start <= nowMs) {
      lock(i.taskId); // its time came: stays today's work
      if (!day.starts[i.taskId] || dragged(i.taskId)) day.starts[i.taskId] = { at: i.start, seen: nowMs };
    }
  }
  // Dragged off today by hand after its time came: it's that day's work now
  for (const id of [...day.locked]) {
    if (!items.has(id) && dragged(id) && tasks.get(id)?.status !== 'done') {
      day.locked = day.locked.filter((x) => x !== id);
      delete day.starts[id];
    }
  }
  // Tasks finished today count as today's work too (e.g. done early, before they were planned)
  for (const t of data.tasks || []) {
    if (t.status === 'done' && t.completedAt && dayKey(appNow(new Date(t.completedAt))) === today) lock(t.id);
  }
  day.locked = day.locked.filter((id) => tasks.has(id));
  for (const id in day.starts) if (!tasks.has(id)) delete day.starts[id];
  store.set('planner_day', day);
  const ids = [...new Set([...day.locked, ...planned.filter((id) => tasks.has(id))])];
  if (!ids.length) return 'off';
  if ((data.behindDays || []).includes(today)) return false; // Falling behind: no tick today
  return ids.every((id) => onTime(tasks.get(id), day.starts[id]));
}

// Returns bonuses newly earned (for celebrations).
export function recheckPlanner(date = new Date()) {
  const data = store.get('planner', null);
  // Not set up yet (no tasks and no fixed times): nothing to judge, no free XP
  if (!data || (!data.tasks?.length && !data.blocks?.length)) return [];
  const hit = plannerHit(data, appNow(date), date);
  let changed = false;
  const day = dayKey(appNow(date));
  for (const h of H.getHabits()) {
    if (h.auto !== 'planner:work') continue;
    changed = H.setExcused(h, day, hit === 'off') || changed;
    changed = H.setDone(h, day, hit === true, date) || changed;
  }
  return changed ? R.sync(appNow(date)) : [];
}

// Launch day. Until START the app is locked behind a countdown and nothing is tracked.
// The first time it opens on or after START, test data from before START is wiped once:
// XP, check-ins, streaks and bonuses, plus food log entries, money entries, journal
// entries and planner tasks. Setup is kept (habits, categories, saved foods and meals,
// goals, budgets, pay settings, the planner's fixed schedule and settings).
import * as store from './store.js';
import { dayKey, fromDayKey, DAY_START_MIN } from './dates.js';
import { icon } from './ui.js';

export const START = '2026-10-26'; // first app day: Monday, so the first week is a full week (4:01 AM)
// Monthly habits start with the first full habit month (Mon Nov 2 – Sun Dec 6), not a 1-week stub.
export const MONTHLY_START = '2026-11-02';
export const monthlyOpen = (key = dayKey()) => key >= MONTHLY_START;

export const isLocked = () => dayKey() < START;

// Moment the app unlocks: START at 4:01 AM local time
export function unlockAt() {
  const d = fromDayKey(START);
  d.setMinutes(DAY_START_MIN);
  return d;
}

export function wipeTestData() {
  if (store.get('launch', null)?.wiped) return false;
  const startMs = unlockAt().getTime();
  store.set('log', {});
  store.set('bonus', {});
  store.remove('planner_day');

  const food = store.get('food', null);
  if (food) store.set('food', { ...food, entries: (food.entries || []).filter((e) => e.date >= START) });

  const money = store.get('money', null);
  if (money) {
    const reviews = Object.fromEntries(Object.entries(money.reviews || {}).filter(([, r]) => r?.doneAt && new Date(r.doneAt).getTime() >= startMs));
    store.set('money', { ...money, entries: (money.entries || []).filter((e) => e.date >= START), reviews });
  }

  const journal = store.get('journal', null);
  if (journal) store.set('journal', { ...journal, days: Object.fromEntries(Object.entries(journal.days || {}).filter(([k]) => k >= START)) });

  const planner = store.get('planner', null);
  if (planner) {
    const tasks = (planner.tasks || []).filter((t) => (t.createdAt || 0) >= startMs);
    store.set('planner', { ...planner, tasks, plan: null, night: null });
  }

  store.set('launch', { start: START, wiped: new Date().toISOString() });
  return true;
}

function left() {
  const ms = Math.max(0, unlockAt() - Date.now());
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return { d, h, m };
}

// Full-screen countdown. Reloads into the real app once it unlocks.
export function showCountdown() {
  document.getElementById('tabbar').hidden = true;
  document.getElementById('hud').hidden = true;
  const screen = document.getElementById('screen');
  const when = unlockAt().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const draw = () => {
    const t = left();
    screen.innerHTML = `<div class="launch">
      <div class="launch__box">
        ${icon('hourglass', 'launch__icon')}
        <p class="launch__title">Improve</p>
        <p class="launch__sub">Your run starts ${when}</p>
        <div class="launch__count">
          <div><b>${t.d}</b><span>days</span></div>
          <div><b>${t.h}</b><span>hrs</span></div>
          <div><b>${t.m}</b><span>min</span></div>
        </div>
        <p class="launch__note">Nothing is tracked until then. On day one you start at LV 1 with a clean slate.</p>
        <p class="launch__ready imp-blink">Press start soon_</p>
      </div></div>`;
  };
  draw();
  setInterval(() => {
    if (!isLocked()) location.reload();
    else draw();
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (!isLocked()) location.reload(); else draw(); } });
}

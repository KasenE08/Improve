// App shell: HUD header, tab routing, midnight rollover, service worker.
import * as H from './habits.js';
import { dayKey, prettyDate } from './dates.js';
import { esc, icon, lvl, xpbar, pct } from './ui.js';
import * as Today from './screens/today.js';
import { renderSoon, renderProfile, bindProfile, openNameSheet } from './screens/other.js';

const TABS = [
  ['today', 'Today', 'today'],
  ['food', 'Food', 'food'],
  ['planner', 'Planner', 'planner'],
  ['money', 'Money', 'wallet'],
  ['profile', 'Profile', 'profile'],
];

const hud = document.getElementById('hud');
const screen = document.getElementById('screen');
const tabbar = document.getElementById('tabbar');
let shownDay = dayKey();

H.init();

function currentTab() {
  const t = location.hash.replace('#', '');
  return TABS.some(([id]) => id === t) ? t : 'today';
}

function renderHud() {
  const today = dayKey();
  const log = H.getLog();
  const habits = H.getAllHabits();
  const byId = new Map(habits.map((h) => [h.id, h]));
  const earned = H.xpOnDay(today, log);
  // Max for today = every active daily habit + whatever weekly/monthly XP was earned today
  const dailyMax = H.getHabits().filter((h) => h.frequency === 'daily').reduce((s, h) => s + h.xp * h.target, 0);
  const bonus = Object.entries(log[today] || {}).reduce((s, [id, e]) => (byId.get(id)?.frequency === 'daily' ? s : s + e.n * e.xp), 0);
  const max = dailyMax + bonus;
  const name = H.getProfile().name;

  hud.innerHTML = `${lvl(1)}
    <div class="hud__main">
      <div class="hud__top"><button class="hud__name" data-act="rename" aria-label="Edit name">${esc(name)}</button><span class="hud__date">${prettyDate()}</span></div>
      ${xpbar(pct(earned, max))}
      <div class="hud__meta"><span>${earned} / ${max} XP</span><span class="hud__today">${icon('xp')}+${earned} today</span></div>
    </div>`;
}

function renderTabs(active) {
  tabbar.innerHTML = TABS.map(([id, label, ic]) =>
    `<a class="imp-tab${id === active ? ' is-active' : ''}" href="#${id}"${id === active ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('');
}

function refresh() {
  shownDay = dayKey();
  const tab = currentTab();
  renderHud();
  renderTabs(tab);
  if (tab === 'today') Today.render(screen, refresh);
  else if (tab === 'profile') renderProfile(screen);
  else renderSoon(screen, tab);
}

Today.bind(screen);
bindProfile(screen, refresh);
hud.addEventListener('click', (e) => { if (e.target.closest('[data-act="rename"]')) openNameSheet(refresh); });

window.addEventListener('hashchange', () => { refresh(); window.scrollTo(0, 0); });

// New day (or week/month) → redraw. Checked often because phones pause timers in the background.
const checkDay = () => { if (dayKey() !== shownDay) refresh(); };
setInterval(checkDay, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
window.addEventListener('focus', checkDay);
window.addEventListener('pageshow', checkDay);

refresh();

// ---- Offline support ----
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch((e) => console.warn('SW failed', e));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A new version was installed: reload once so the whole app matches it.
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
}

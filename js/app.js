// App shell: HUD header, tab routing, midnight rollover, service worker.
import * as H from './habits.js';
import * as R from './rewards.js';
import * as Stats from './stats.js';
import { dayKey, prettyDate } from './dates.js';
import { esc, icon, lvl, xpbar, meter, pct } from './ui.js';
import * as Today from './screens/today.js';
import { renderSoon } from './screens/other.js';
import * as Profile from './screens/profile.js';

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

// First launch seeds data; an upgrade from Phase 1 awards Perfect Days already earned.
const foundSchema = H.init();
if (foundSchema === 1) R.awardPastPerfectDays();
R.sync();

function currentTab() {
  const t = location.hash.replace('#', '');
  return TABS.some(([id]) => id === t) ? t : 'today';
}

function renderHud() {
  const st = Stats.compute();
  const t = Stats.today();
  const name = H.getProfile().name;
  const o = st.overall;

  hud.innerHTML = `${lvl(o.level)}
    <div class="hud__main">
      <div class="hud__top"><button class="hud__name" data-act="rename" aria-label="Edit name">${esc(name)}</button><span class="hud__rank">${esc(st.rank.name)}</span></div>
      ${xpbar(o.pct)}
      <div class="hud__meta"><span>${o.into} / ${o.need} XP</span><span class="hud__date">${prettyDate()}</span></div>
      ${meter('Today', pct(t.earned, t.max), `${icon('xp')}+${t.earned}`)}
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
  else if (tab === 'profile') Profile.render(screen);
  else renderSoon(screen, tab);
}

Today.bind(screen);
Profile.bind(screen, refresh);
hud.addEventListener('click', (e) => { if (e.target.closest('[data-act="rename"]')) Profile.openNameSheet(refresh); });

window.addEventListener('hashchange', () => { refresh(); window.scrollTo(0, 0); });

// New day (or week/month) → redraw. Checked often because phones pause timers in the background.
const checkDay = () => { if (dayKey() !== shownDay) { R.sync(); refresh(); } };
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

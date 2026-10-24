// App shell: HUD header, tab routing, midnight rollover, service worker.
import * as H from './habits.js';
import * as R from './rewards.js';
import * as Stats from './stats.js';
import { dayKey, prettyDate } from './dates.js';
import { esc, icon, lvl, xpbar, meter, pct } from './ui.js';
import * as Today from './screens/today.js';
import * as Food from './screens/food.js';
import * as Money from './screens/money.js';
import { recheckMoney } from './money/autocheck.js';
import * as Profile from './screens/profile.js';
import { recheckPlanner } from './planner-auto.js';
import { panel, empty } from './ui.js';
import { celebrate } from './screens/today.js';

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
Food.recheckToday();
recheckMoney();
R.sync();

function currentTab() {
  const t = location.hash.replace('#', '').split('?')[0];
  return TABS.some(([id]) => id === t) ? t : 'today';
}

// ---- Planner tab (built bundle, loaded on demand) ----
let planner = null;        // the loaded module
let plannerMounted = false;
let plannerLoad = null;
function loadPlanner() {
  plannerLoad ||= import('./planner/planner.js').then((m) => {
    planner = m;
    // Every saved planner change: re-check "Work done on schedule" and update the HUD.
    m.start({ onChange: () => { const before = Stats.compute(); const added = recheckPlanner(); renderHud(); celebrate(before, Stats.compute(), added); } });
    recheckPlanner();
    renderHud();
    return m;
  }).catch((e) => { console.warn('Planner failed to load', e); plannerLoad = null; throw e; });
  return plannerLoad;
}
function unmountPlanner() {
  if (plannerMounted && planner) planner.unmount(screen);
  plannerMounted = false;
}
function showPlanner() {
  if (plannerMounted) return;
  if (planner) { screen.innerHTML = ''; planner.mount(screen); plannerMounted = true; return; }
  screen.innerHTML = `<div class="screen">${panel({ title: 'Planner', body: empty({ icon: 'hourglass', title: 'Loading', text: 'One moment…' }) })}</div>`;
  loadPlanner().then(() => { if (currentTab() === 'planner') showPlanner(); })
    .catch(() => { screen.innerHTML = `<div class="screen">${panel({ title: 'Planner', body: empty({ icon: 'info', title: 'Couldn’t load', text: 'Check your connection and reopen the app.' }) })}</div>`; });
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
  if (tab === 'planner') { screen.dataset.tab = tab; showPlanner(); return; }
  unmountPlanner();
  screen.dataset.tab = tab;
  if (tab === 'today') Today.render(screen, refresh);
  else if (tab === 'food') Food.render(screen, refresh);
  else if (tab === 'money') Money.render(screen, refresh);
  else if (tab === 'profile') Profile.render(screen);
}

Today.bind(screen);
Food.bind(screen);
Money.bind(screen);
Profile.bind(screen, refresh);
hud.addEventListener('click', (e) => { if (e.target.closest('[data-act="rename"]')) Profile.openNameSheet(refresh); });

window.addEventListener('hashchange', () => {
  const id = takeTaskFromHash();
  refresh();
  window.scrollTo(0, 0);
  if (id) loadPlanner().then((m) => m.openTask(id, plannerMounted)).catch(() => {});
});

// New day (or week/month) → redraw. Checked often because phones pause timers in the background.
const checkDay = () => { Food.recheckToday(); recheckPlanner(); recheckMoney(); if (dayKey() !== shownDay) { R.sync(); refresh(); } };
setInterval(checkDay, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
window.addEventListener('focus', checkDay);
window.addEventListener('pageshow', checkDay);

// Opened from a notification tap: #planner?task=ID
function takeTaskFromHash() {
  const m = location.hash.match(/^#planner\?task=(.+)$/);
  if (!m) return null;
  history.replaceState(null, '', '#planner');
  return decodeURIComponent(m[1]);
}
const tappedTask = takeTaskFromHash();

refresh();

// Load the planner in the background: replans on a new day and keeps notifications in sync.
const plannerReady = loadPlanner().catch(() => null);
if (tappedTask) plannerReady.then((m) => m && m.openTask(tappedTask, plannerMounted));
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type !== 'open-task') return;
  if (currentTab() !== 'planner') location.hash = 'planner';
  plannerReady.then((m) => m && m.openTask(e.data.taskId, plannerMounted));
});

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

// App shell: HUD header, tab routing, midnight rollover, service worker.
import * as H from './habits.js';
import * as R from './rewards.js';
import * as Stats from './stats.js';
import { dayKey } from './dates.js';
import { icon } from './ui.js';
import { renderHud as drawHud, bindHud } from './hud.js';
import { startTheme } from './theme.js';
import * as Today from './screens/today.js';
import * as Food from './screens/food.js';
import * as Money from './screens/money.js';
import * as Journal from './screens/journal.js';
import { recheckJournal } from './journal/autocheck.js';
import { recheckMoney } from './money/autocheck.js';
import * as Profile from './screens/profile.js';
import * as Home from './screens/home.js';
import { recheckPlanner } from './planner-auto.js';
import { panel, empty } from './ui.js';
import { celebrate } from './screens/today.js';
import { isLocked, showCountdown, wipeTestData } from './launch.js';
import { reload as reloadFood } from './food/store.js';

// One screen: Home (header + cards). Each card opens a full page with "‹ Home" at the top.
const PAGES = { home: '', today: 'Habits', food: 'Food & water', planner: 'Plan', money: 'Money', journal: 'Journal', profile: 'You' };

const hud = document.getElementById('hud');
const screen = document.getElementById('screen');
let shownDay = dayKey();

// Locked behind a countdown until launch day; on launch day, test data is wiped once.
if (isLocked()) showCountdown();
else boot();

function boot() {
  wipeTestData();
  // First launch seeds data; an upgrade from Phase 1 awards Perfect Days already earned.
  const foundSchema = H.init();
  reloadFood(); // the Food tab keeps its data in memory: re-read it after the launch wipe and upgrades (e.g. schema 11 water)
  if (foundSchema === 1) R.awardPastPerfectDays();
  Food.recheckToday();
  recheckMoney();
  recheckJournal();
  const openedWith = R.sync(); // e.g. limit habits paid out for a week that just ended

  function currentTab() {
    const t = location.hash.replace('#', '').split('?')[0];
    return t in PAGES ? t : 'home';
  }

  // ---- Planner tab (built bundle, loaded on demand) ----
  let planner = null;        // the loaded module
  let plannerMounted = false;
  let plannerLoad = null;
  function loadPlanner() {
    plannerLoad ||= import('./planner/planner.js').then((m) => {
      planner = m;
      // Every saved planner change: re-check "Finished today's work" and update the HUD.
      m.start({ onChange: () => { const before = Stats.compute(); const added = recheckPlanner(); renderHud(); celebrate(before, Stats.compute(), added); } });
      const added = recheckPlanner();
      renderHud();
      if (['home', 'today'].includes(currentTab())) refresh(); // show Work's tick or day off
      if (added.length) celebrate(Stats.compute(), Stats.compute(), added);
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

  // Home shows the week header; a page shows "‹ Home" and its title
  const renderHud = () => {
    const tab = currentTab();
    hud.className = tab === 'home' ? 'hud' : 'phead';
    if (tab === 'home') drawHud(hud);
    else {
      // The planner's settings live behind ⋯ here in the top bar (the planner listens for this event)
      const end = tab === 'planner' ? `<button class="phead__more" data-act="planner-menu" aria-label="Planner settings">${icon('more')}</button>`
        : tab === 'today' ? `<button class="phead__more" data-act="new-habit" aria-label="New habit">${icon('plus')}</button>`
        : tab === 'food' ? `<button class="phead__more" data-act="food-menu" aria-label="Saved foods, meals and goals">${icon('more')}</button>`
        : tab === 'money' ? `<button class="phead__more" data-act="money-menu" aria-label="Budgets and paychecks">${icon('more')}</button>` : '';
      hud.innerHTML = `<button class="phead__back" data-act="home">${icon('prev')}Home</button><h1 class="phead__title">${PAGES[tab]}</h1><span class="phead__end">${end}</span>`;
    }
  };
  let openedFromHome = false; // back goes back in history only when Home is behind this page

  function refresh() {
    shownDay = dayKey();
    const tab = currentTab();
    renderHud();
    Journal.flush(); // save anything still being typed before the screen changes
    if (tab === 'planner') { screen.dataset.tab = tab; showPlanner(); return; }
    unmountPlanner();
    screen.dataset.tab = tab;
    if (tab === 'home') Home.render(screen, refresh);
    else if (tab === 'today') Today.render(screen, refresh);
    else if (tab === 'food') Food.render(screen, refresh);
    else if (tab === 'money') Money.render(screen, refresh);
    else if (tab === 'journal') Journal.render(screen, refresh, renderHud);
    else if (tab === 'profile') Profile.render(screen);
  }

  Home.bind(screen);
  Today.bind(screen);
  Food.bind(screen);
  Money.bind(screen);
  Journal.bind(screen);
  Profile.bind(screen, refresh);
  bindHud(hud, { rename: () => Profile.openNameSheet(refresh), refresh });
  hud.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="planner-menu"]')) return window.dispatchEvent(new Event('improve:planner-menu'));
    if (e.target.closest('[data-act="new-habit"]')) return Today.openHabitForm(null);
    if (e.target.closest('[data-act="food-menu"]')) { if (currentTab() === 'food') Food.openMenu(); return; }
    if (e.target.closest('[data-act="money-menu"]')) { if (currentTab() === 'money') Money.openMenu(); return; }
    if (!e.target.closest('[data-act="home"]')) return;
    if (openedFromHome) history.back(); else location.replace('#');
  });
  startTheme(() => renderHud()); // light/dark: 7 PM → 4 AM automatically

  let lastTab = currentTab();
  window.addEventListener('hashchange', () => {
    const tab = currentTab();
    if (tab !== 'home') openedFromHome = lastTab === 'home' || (openedFromHome && lastTab === tab);
    if (lastTab === 'money' && tab !== 'money') Money.reset(); // Money opens on its main page next time
    lastTab = tab;
    const id = takeTaskFromHash();
    refresh();
    window.scrollTo(0, 0);
    if (id) loadPlanner().then((m) => m.openTask(id, plannerMounted)).catch(() => {});
  });

  // New day (or week/month) → redraw. Checked often because phones pause timers in the background.
  // Also catches auto habits that tick on their own as time passes (e.g. "Finished today's work" at 3 PM).
  const checkDay = () => {
    const before = Stats.compute();
    const offBefore = JSON.stringify(H.getExcused());
    const added = [...Food.recheckToday(), ...recheckPlanner(), ...recheckMoney(), ...recheckJournal()];
    if (dayKey() !== shownDay) { const fresh = R.sync(); refresh(); celebrate(before, Stats.compute(), [...added, ...fresh]); return; }
    const after = Stats.compute();
    if (after.total === before.total && !added.length && JSON.stringify(H.getExcused()) === offBefore) return;
    renderHud();
    // Redraw lists that show ticks; leave Food/Money/Journal/Planner alone so typing isn't interrupted
    if (['home', 'today', 'profile'].includes(currentTab())) refresh();
    celebrate(before, after, added);
  };
  setInterval(checkDay, 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) Journal.flush(); else checkDay(); });
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
  if (openedWith.length) { const st = Stats.compute(); celebrate(st, st, openedWith); }

  // Load the planner in the background: replans on a new day and keeps notifications in sync.
  const plannerReady = loadPlanner().catch(() => null);
  if (tappedTask) plannerReady.then((m) => m && m.openTask(tappedTask, plannerMounted));
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type !== 'open-task') return;
    if (currentTab() !== 'planner') location.hash = 'planner';
    plannerReady.then((m) => m && m.openTask(e.data.taskId, plannerMounted));
  });
}

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

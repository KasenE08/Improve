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
import { celebrate } from './screens/today.js';
import { isLocked, showCountdown, wipeTestData } from './launch.js';
import { reload as reloadFood } from './food/store.js';
import * as store from './store.js';

// One screen: Home (header + cards). Each card opens a full page with "‹ Home" at the top.
const PAGES = { home: '', today: 'Habits', food: 'Food & water', money: 'Money', journal: 'Journal', profile: 'You' };

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

  // Home shows the week header; a page shows "‹ Home" and its title
  const renderHud = () => {
    const tab = currentTab();
    hud.className = tab === 'home' ? 'hud' : 'phead';
    if (tab === 'home') drawHud(hud);
    else {
      const end = tab === 'today' ? `<button class="phead__more" data-act="new-habit" aria-label="New habit">${icon('plus')}</button>`
        : tab === 'food' ? `<button class="phead__more" data-act="food-menu" aria-label="Saved foods, meals and goals">${icon('more')}</button>`
        : tab === 'money' ? `<button class="phead__more" data-act="money-menu" aria-label="Budgets and paychecks">${icon('more')}</button>`
        : tab === 'journal' ? `<button class="phead__more" data-act="journal-menu" aria-label="Journal settings">${icon('more')}</button>` : '';
      hud.innerHTML = `<button class="phead__back" data-act="home">${icon('prev')}Home</button><h1 class="phead__title">${PAGES[tab]}</h1><span class="phead__end">${end}</span>`;
    }
  };
  let openedFromHome = false; // back goes back in history only when Home is behind this page

  function refresh() {
    shownDay = dayKey();
    const tab = currentTab();
    renderHud();
    Journal.flush(); // save anything still being typed before the screen changes
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
    if (e.target.closest('[data-act="new-habit"]')) return Today.openHabitForm(null);
    if (e.target.closest('[data-act="food-menu"]')) { if (currentTab() === 'food') Food.openMenu(); return; }
    if (e.target.closest('[data-act="money-menu"]')) { if (currentTab() === 'money') Money.openMenu(); return; }
    if (e.target.closest('[data-act="journal-menu"]')) { if (currentTab() === 'journal') Journal.openMenu(); return; }
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
    refresh();
    window.scrollTo(0, 0);
  });

  // New day (or week/month) → redraw. Checked often because phones pause timers in the background.
  // Also catches auto habits that tick on their own as time passes (e.g. "Finished today's work" at 3 PM).
  const checkDay = () => {
    const before = Stats.compute();
    const offBefore = JSON.stringify(H.getExcused());
    const added = [...Food.recheckToday(), ...recheckMoney(), ...recheckJournal()];
    if (dayKey() !== shownDay) { const fresh = R.sync(); refresh(); celebrate(before, Stats.compute(), [...added, ...fresh]); return; }
    const after = Stats.compute();
    if (after.total === before.total && !added.length && JSON.stringify(H.getExcused()) === offBefore) return;
    renderHud();
    // Redraw lists that show ticks; leave Food/Money/Journal alone so typing isn't interrupted
    if (['home', 'today', 'profile'].includes(currentTab())) refresh();
    celebrate(before, after, added);
  };
  setInterval(checkDay, 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) Journal.flush(); else checkDay(); });
  window.addEventListener('focus', checkDay);
  window.addEventListener('pageshow', checkDay);

  refresh();
  if (openedWith.length) { const st = Stats.compute(); celebrate(st, st, openedWith); }

  // The planner was removed (events moved to Google Calendar). Once: tell its notification server to
  // forget this phone so old reminders stop. The planner's data stays in storage (and backups), hidden.
  retirePlanner();
}

// ---- Offline support ----
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  const reg = navigator.serviceWorker.register('sw.js', { scope: './' }).catch((e) => console.warn('SW failed', e));
  // Look for a new version whenever the app comes back to the front
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.then((r) => r?.update()).catch(() => {}); });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A new version was installed: show a pop-up; tapping it reloads into the new version.
    if (!hadController || document.querySelector('.upd-pop')) return;
    const pop = document.createElement('button');
    pop.className = 'upd-pop';
    pop.innerHTML = '<b>Update ready</b><span>Tap to load the new version</span>';
    pop.onclick = () => { try { sessionStorage.setItem('imp_updated', '1'); } catch (_) {} location.reload(); };
    document.body.appendChild(pop);
  });
}
// Just reloaded into a new version: say so
try {
  if (sessionStorage.getItem('imp_updated')) {
    sessionStorage.removeItem('imp_updated');
    const done = document.createElement('div');
    done.className = 'upd-pop is-done';
    done.innerHTML = '<b>Updated</b><span>You\'re on the newest version</span>';
    document.body.appendChild(done);
    setTimeout(() => done.remove(), 3500);
  }
} catch (_) {}

function retirePlanner() {
  const data = store.get('planner', null);
  const p = data?.push;
  if (!p) return;
  store.set('planner', { ...data, push: null });
  const url = String(p.url || '').trim().replace(/\/+$/, '');
  if (/^https:\/\//.test(url)) {
    fetch(`${url}/unregister`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: p.deviceId, secret: p.secret }) }).catch(() => {});
  }
  navigator.serviceWorker?.ready.then((r) => r.pushManager?.getSubscription()).then((s) => s?.unsubscribe()).catch(() => {});
}

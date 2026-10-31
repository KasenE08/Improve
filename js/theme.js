// Light / dark mode. Automatic: dark from 7 PM until 4 AM (when the app's day starts), light the rest.
// The switch in the header overrides that until the next automatic change (7 PM or 4 AM).
//   imp_theme { mode: 'light' | 'dark', until: ms }
import * as store from './store.js';

const DARK_FROM = 19 * 60;  // 7 PM
const LIGHT_FROM = 4 * 60;  // 4 AM
const BAR = { light: '#f4f5f7', dark: '#0b0d12' };

const mins = (d) => d.getHours() * 60 + d.getMinutes();
export const autoTheme = (now = new Date()) => (mins(now) >= DARK_FROM || mins(now) < LIGHT_FROM ? 'dark' : 'light');

/** The next automatic change after `now`. */
export function nextSwitch(now = new Date()) {
  const d = new Date(now);
  const m = mins(now);
  if (m < LIGHT_FROM) d.setHours(4, 0, 0, 0);
  else if (m < DARK_FROM) d.setHours(19, 0, 0, 0);
  else { d.setDate(d.getDate() + 1); d.setHours(4, 0, 0, 0); }
  return d.getTime();
}

export function currentTheme(now = new Date()) {
  const o = store.get('theme', null);
  return o && o.until > now.getTime() && (o.mode === 'dark' || o.mode === 'light') ? o.mode : autoTheme(now);
}

export function applyTheme(now = new Date()) {
  const t = currentTheme(now);
  if (typeof document === 'undefined') return t;
  const root = document.documentElement;
  if (root.dataset.theme !== t) root.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[t]);
  return t;
}

export function toggleTheme(now = new Date()) {
  const mode = currentTheme(now) === 'dark' ? 'light' : 'dark';
  store.set('theme', { mode, until: nextSwitch(now) });
  return applyTheme(now);
}

/** Keeps the theme right as time passes (checks every 30 s and when the app comes back). */
export function startTheme(onChange) {
  let last = applyTheme();
  const tick = () => { const t = applyTheme(); if (t !== last) { last = t; onChange && onChange(t); } };
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

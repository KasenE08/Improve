// Header ("Week View"): the date, this week's days as progress circles, this week's weekly habits,
// the light/dark switch, and the month calendar + day details sheets.
//
// A day's circle fills with the share of daily habits done that day (days off don't count either way,
// a limit counts as done while you're at or under it). A Perfect Day (every daily habit done) is a solid circle.
import * as H from './habits.js';
import * as R from './rewards.js';
import * as store from './store.js';
import * as Food from './food/store.js';
import * as Money from './money/store.js';
import * as Journal from './journal/store.js';
import { MEALS, MEAL_LABELS, totals } from './food/logic.js';
import { fmtMoney } from './money/logic.js';
import { dayKey, appNow, addDays, fromDayKey, weekStart } from './dates.js';
import { START } from './launch.js';
import { esc, icon, xpbar, sheet, pct, confirmBox, toast } from './ui.js';
import { currentTheme, toggleTheme } from './theme.js';
import { DEV, seedDev } from './devmode.js';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const fmt = (k, o) => fromDayKey(k).toLocaleDateString('en-US', o);

/** Daily habits for a day: { done, total, perfect, items: [{ h, n, done, off }] } (null before launch / future). */
export function dayStatus(key, ctx = context()) {
  const today = dayKey();
  if (key < START || key > today) return null;
  const items = ctx.habits.filter((h) => h.frequency === 'daily').map((h) => {
    const n = ctx.log[key]?.[h.id]?.n || 0;
    return { h, n, done: H.isDone(h, n), off: H.isExcused(h.id, key, ctx.ex) };
  });
  const counted = items.filter((i) => !i.off);
  const done = counted.filter((i) => i.done).length;
  return { done, total: counted.length, perfect: !!ctx.bonus[key]?.perfect, items };
}

/** This week's weekly habits: { done, total }. Weeks off don't count; a limit counts while you're at or under it. */
export function weekStatus(date = appNow(), ctx = context()) {
  const ws = ctx.habits.filter((h) => h.frequency === 'weekly' && !H.offIn(h, date, ctx.ex));
  return { done: ws.filter((h) => H.isDone(h, H.progress(h, date, ctx.log))).length, total: ws.length };
}

function context() {
  return { habits: H.getHabits(), log: H.getLog(), ex: H.getExcused(), bonus: R.getBonus() };
}

// A day as a progress circle. Today is filled dark; a Perfect Day is solid red.
function dayCircle(key, st, { today, small = false } = {}) {
  const p = st && st.total ? Math.round((st.done / st.total) * 100) : 0;
  const cls = ['hday', small ? 'hday--sm' : '', key === today ? 'is-today' : '', st?.perfect ? 'is-perfect' : '', st ? '' : 'is-blank'].filter(Boolean).join(' ');
  const label = st ? `${fmt(key, { weekday: 'long', month: 'short', day: 'numeric' })}: ${st.done} of ${st.total} daily habits${st.perfect ? ', Perfect Day' : ''}` : fmt(key, { weekday: 'long', month: 'short', day: 'numeric' });
  return `<button class="${cls}" data-day="${key}" style="--p:${p}" aria-label="${esc(label)}"${st ? '' : ' disabled'}>
    ${small ? '' : `<span class="hday__dow">${DOW[fromDayKey(key).getDay()]}</span>`}
    <span class="hday__ring"><span class="hday__num">${fromDayKey(key).getDate()}</span></span></button>`;
}

export function renderHud(el) {
  const ctx = context();
  const now = appNow();
  const today = dayKey(now);
  const ws = weekStart(now);
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(ws, i)));
  const wk = weekStatus(now, ctx);
  const theme = currentTheme();
  const name = H.getProfile().name;
  el.innerHTML = `
    <div class="hud__top">
      <button class="hud__date" data-act="month" aria-label="Open the month calendar">
        <span class="hud__dow">${fmt(today, { weekday: 'long' })}</span>
        <span class="hud__day">${fmt(today, { month: 'short', day: 'numeric' })}${icon('next', 'hud__chev')}</span>
      </button>
      <div class="hud__right">
        ${DEV ? '<button class="hud__dev" data-act="dev">DEV</button>' : ''}
        <button class="hud__theme" data-act="theme" aria-label="${theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}">${icon(theme === 'dark' ? 'sun' : 'moon')}</button>
        <a class="hud__me" href="#profile" aria-label="You: ${esc(name)}">${esc((name.trim()[0] || '?').toUpperCase())}</a>
      </div>
    </div>
    <div class="hud__week">${days.map((k) => dayCircle(k, dayStatus(k, ctx), { today })).join('')}</div>
    ${wk.total ? `<div class="hud__wbar"><div class="hud__wtop"><span>This week</span><span><b>${wk.done}</b> of ${wk.total} weekly habits</span></div>${xpbar(pct(wk.done, wk.total), 'imp-xpbar--sm')}</div>` : ''}`;
}

// ---- Month calendar --------------------------------------------------------------------------
let monthShown = null; // 'YYYY-MM'

function monthBody(mk) {
  const ctx = context();
  const today = dayKey();
  const [y, m] = mk.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const count = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  let perfect = 0, tracked = 0;
  for (let d = 1; d <= count; d++) {
    const key = `${mk}-${String(d).padStart(2, '0')}`;
    const st = dayStatus(key, ctx);
    if (st) { tracked++; if (st.perfect) perfect++; }
    cells.push(dayCircle(key, st, { today, small: true }));
  }
  const prev = new Date(y, m - 2, 1), next = new Date(y, m, 1);
  const mkOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const canNext = mkOf(next) <= today.slice(0, 7);
  const canPrev = mkOf(prev) >= START.slice(0, 7);
  return `<div class="cal">
    <div class="cal__nav">
      <button class="cal__arrow" data-cal="${mkOf(prev)}" aria-label="Previous month"${canPrev ? '' : ' disabled'}>${icon('prev')}</button>
      <span class="cal__title">${first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
      <button class="cal__arrow" data-cal="${mkOf(next)}" aria-label="Next month"${canNext ? '' : ' disabled'}>${icon('next')}</button>
    </div>
    <div class="cal__grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="cal__wd">${d}</span>`).join('')}${cells.join('')}</div>
    <div class="cal__legend"><span><i class="cal__dot"></i>Ring = daily habits done</span><span><i class="cal__dot is-solid"></i>Perfect Day</span></div>
    ${tracked ? `<p class="cal__sum"><b>${perfect}</b> Perfect ${perfect === 1 ? 'Day' : 'Days'} this month</p>` : ''}
  </div>`;
}

export function openMonth(mk = dayKey().slice(0, 7)) {
  monthShown = mk;
  sheet.open({
    title: 'Calendar',
    body: monthBody(mk),
    onMount(b) {
      b.onclick = (e) => {
        const nav = e.target.closest('[data-cal]');
        if (nav) { monthShown = nav.dataset.cal; b.innerHTML = monthBody(monthShown); return; }
        const d = e.target.closest('[data-day]');
        if (d && !d.disabled) openDay(d.dataset.day, true);
      };
    },
  });
}

// ---- Day details -------------------------------------------------------------------------------
function section(title, meta, body) {
  return `<section class="dd"><header class="dd__head"><h3>${esc(title)}</h3><span>${meta}</span></header>${body}</section>`;
}

function dayBody(key) {
  const ctx = context();
  const st = dayStatus(key, ctx);
  const parts = [];

  // Habits
  if (st) {
    const rows = st.items.map((i) => `<li class="dd__row${i.done ? ' is-done' : ''}${i.off ? ' is-off' : ''}">
      <span class="dd__mark">${i.off ? '–' : i.done ? icon('check') : ''}</span>
      <span class="dd__name">${esc(i.h.name)}</span>
      <span class="dd__val">${i.off ? 'Day off' : H.isLimit(i.h) ? `${i.n}/${i.h.target} max` : i.h.target > 1 ? `${Math.min(i.n, i.h.target)}/${i.h.target}` : ''}</span></li>`).join('');
    const others = Object.entries(ctx.log[key] || {})
      .map(([id, e]) => ({ h: ctx.habits.find((x) => x.id === id), e }))
      .filter(({ h }) => h && h.frequency !== 'daily')
      .map(({ h, e }) => `<li class="dd__row is-done"><span class="dd__mark">${icon('check')}</span><span class="dd__name">${esc(h.name)}</span><span class="dd__val">${h.frequency === 'weekly' ? 'Weekly' : 'Monthly'}${e.n > 1 ? ` ×${e.n}` : ''}</span></li>`).join('');
    const perfect = st.perfect ? `<div class="dd__perfect">${icon('star')}Perfect Day: every daily habit done</div>` : '';
    parts.push(section('Habits', `${st.done}/${st.total}`, `${perfect}<ul class="dd__list">${rows}</ul>${others ? `<p class="dd__sub">Weekly &amp; monthly</p><ul class="dd__list">${others}</ul>` : ''}`));
  }

  // Food + water
  const entries = Food.entriesFor(key);
  const water = Food.waterFor(key);
  const g = Food.getGoals();
  if (entries.length || water) {
    const t = totals(entries);
    const meals = MEALS.map((m) => {
      const list = entries.filter((e) => e.meal === m);
      if (!list.length) return '';
      return `<p class="dd__sub">${MEAL_LABELS[m]}</p><ul class="dd__list">${list.map((e) => `<li class="dd__row"><span class="dd__name">${esc(e.name || e.label || 'Food')}</span><span class="dd__val">${Math.round(e.cal)} cal · ${Math.round(e.protein)} g</span></li>`).join('')}</ul>`;
    }).join('');
    const stats = `<div class="dd__stats">
      <div><b>${Math.round(t.cal).toLocaleString()}</b><span>of ${g.calGoal.toLocaleString()} cal</span></div>
      <div><b>${Math.round(t.protein)} g</b><span>protein</span></div>
      <div><b>${water} oz</b><span>of ${g.waterGoal} oz water</span></div></div>`;
    parts.push(section('Food & water', '', stats + meals));
  }

  // Money
  const ms = Money.getState();
  const cur = ms.settings?.currency || '$';
  const moves = (ms.entries || []).filter((e) => e.date === key);
  if (moves.length) {
    const catName = (id) => ms.categories.find((c) => c.id === id)?.name || 'Other';
    const label = { expense: 'Expense', income: 'Paycheck', saving: 'To savings', transfer: 'Move', adjust: 'Balance fix' };
    const spent = moves.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
    const rows = moves.map((e) => `<li class="dd__row"><span class="dd__name">${esc(e.note || (e.kind === 'expense' ? catName(e.cat) : label[e.kind] || 'Entry'))}<small>${e.kind === 'expense' ? esc(catName(e.cat)) : label[e.kind] || ''}</small></span>
      <span class="dd__val dd__money${e.kind === 'income' ? ' is-in' : ''}">${e.kind === 'income' ? '+' : e.kind === 'expense' ? '−' : ''}${fmtMoney(Math.abs(e.amount), cur)}</span></li>`).join('');
    parts.push(section('Money', spent ? `${fmtMoney(spent, cur)} spent` : '', `<ul class="dd__list">${rows}</ul>`));
  }

  // Planner: assignments finished that day
  const planner = store.get('planner', null);
  const finished = (planner?.tasks || []).filter((t) => t.status === 'done' && t.completedAt && dayKey(appNow(new Date(t.completedAt))) === key);
  if (finished.length) {
    parts.push(section('Planner', `${finished.length} done`, `<ul class="dd__list">${finished.map((t) => `<li class="dd__row is-done"><span class="dd__mark">${icon('check')}</span><span class="dd__name">${esc(t.title)}</span></li>`).join('')}</ul>`));
  }

  // Journal
  const text = Journal.getDay(key);
  if (text.trim()) parts.push(section('Journal', `${Journal.wordCount(text)} words`, `<p class="dd__journal">${esc(text)}</p>`));

  if (!parts.length) parts.push('<p class="dd__empty">Nothing logged this day.</p>');
  return parts.join('');
}

export function openDay(key, fromMonth = false) {
  const title = fromDayKey(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  sheet.open({
    title,
    body: `${fromMonth ? `<button class="dd__back" data-back>${icon('prev')}Calendar</button>` : ''}${dayBody(key)}`,
    onMount(b) { b.onclick = (e) => { if (e.target.closest('[data-back]')) openMonth(monthShown || key.slice(0, 7)); }; },
  });
}

// ---- Clicks on the header ----------------------------------------------------------------------
export function bindHud(el, { rename, refresh }) {
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'rename') return rename();
    if (act === 'month') return openMonth();
    if (act === 'theme') { toggleTheme(); renderHud(el); return; }
    if (act === 'dev') {
      const ok = await confirmBox({ title: 'Reset the dev copy?', text: 'Copies your real app data into this dev preview again. Your real app is not changed.', ok: 'Copy again', icon: 'info' });
      if (ok && seedDev(true)) { toast('Copied'); setTimeout(() => location.reload(), 400); }
      return;
    }
    const d = e.target.closest('[data-day]');
    if (d && !d.disabled) openDay(d.dataset.day);
  });
}


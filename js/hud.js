// Header ("Week View"): the date, this week's days as progress circles, this week's weekly habits,
// the light/dark switch, and the month calendar + day details sheets.
//
// A day's circle fills with the share of daily habits done that day (days off don't count either way,
// a limit counts as done while you're at or under it). A Perfect Day (every daily habit done) is a solid circle.
import * as H from './habits.js';
import * as R from './rewards.js';
import * as Food from './food/store.js';
import * as Money from './money/store.js';
import * as Journal from './journal/store.js';
import { MEALS, MEAL_LABELS, totals } from './food/logic.js';
import { fmtMoney } from './money/logic.js';
import { dayKey, appNow, addDays, fromDayKey, weekStart } from './dates.js';
import { START } from './launch.js';
import { esc, icon, sheet, confirmBox, toast } from './ui.js';
import { currentTheme, toggleTheme } from './theme.js';
import { DEV, seedDev } from './devmode.js';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const fmt = (k, o) => fromDayKey(k).toLocaleDateString('en-US', o);

/**
 * The habits on a day: { done, total, perfect, items: [{ h, n, level, done, off }] } (null before launch / future).
 * Only habits scheduled that day count (Lift only on a day with a session). level 1 = 2-min, 2 = Full;
 * fast food: 2 = none, 1 = a pass used, 0 = over the week's passes. A day with any 2-min isn't a Perfect Day.
 */
export function dayStatus(key, ctx = context()) {
  const today = dayKey();
  if (key < START || key > today) return null;
  const items = [];
  for (const h of ctx.habits) {
    if (H.isExcused(h.id, key, ctx.ex)) continue;
    if (H.isFastFood(h)) {
      const n = H.usesOn(h, key, ctx.log);
      const over = n > 0 && R.passesUsed(h, fromDayKey(key), ctx.log) > h.target;
      items.push({ h, n, level: over ? 0 : n ? 1 : 2, off: false });
      continue;
    }
    if (!R.isScheduled(h, key, ctx.rc)) continue;
    const level = H.levelOn(h, key, ctx.log);
    if (H.isLift(h) && !level) continue;
    items.push({ h, n: level ? 1 : 0, level, off: false });
  }
  for (const i of items) i.done = i.level > 0;
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, perfect: items.length > 0 && !!ctx.bonus[key]?.perfect, items };
}

function context() {
  const log = H.getLog();
  return { habits: H.getHabits(), log, ex: H.getExcused(), bonus: R.getBonus(), rc: R.makeCtx(log) };
}

// A day as a progress circle. Today is filled dark; a Perfect Day is solid. A day with every habit done but
// some only 2-min is a full ring that stays hollow.
function dayCircle(key, st, { today, small = false, i = 0 } = {}) {
  const p = st && st.total ? Math.round((st.done / st.total) * 100) : 0;
  const cls = ['hday', small ? 'hday--sm' : '', key === today ? 'is-today' : '', st?.perfect ? 'is-perfect' : '', st ? '' : 'is-blank'].filter(Boolean).join(' ');
  const label = st ? `${fmt(key, { weekday: 'long', month: 'short', day: 'numeric' })}: ${st.done} of ${st.total} daily habits${st.perfect ? ', Perfect Day' : ''}` : fmt(key, { weekday: 'long', month: 'short', day: 'numeric' });
  return `<button class="${cls}" data-day="${key}" style="--p:${p};--i:${i}" aria-label="${esc(label)}"${st ? '' : ' disabled'}>
    ${small ? '' : `<span class="hday__dow">${DOW[fromDayKey(key).getDay()]}</span>`}
    <span class="hday__ring"><span class="hday__num">${fromDayKey(key).getDate()}</span></span></button>`;
}

export function renderHud(el) {
  const ctx = context();
  const now = appNow();
  const today = dayKey(now);
  const ws = weekStart(now);
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(ws, i)));
  const perfectWeek = days.every((k) => dayStatus(k, ctx)?.perfect); // all 7 days Perfect Days: the strip turns gold
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
    <div class="hud__week${perfectWeek ? ' is-gold' : ''}">${days.map((k, i) => dayCircle(k, dayStatus(k, ctx), { today, i })).join('')}</div>
    ${perfectWeek ? `<span class="hud__pweek">${icon('star')}Perfect Week</span>` : ''}
`;
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
  const perfectMonth = ctx.habits.length > 0 && perfect === count; // every day of the month a Perfect Day: gold frame + label
  return `<div class="cal${perfectMonth ? ' is-gold' : ''}">
    <div class="cal__nav">
      <button class="cal__arrow" data-cal="${mkOf(prev)}" aria-label="Previous month"${canPrev ? '' : ' disabled'}>${icon('prev')}</button>
      <span class="cal__title">${first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}${perfectMonth ? `<span class="cal__pmonth">${icon('star')}Perfect Month</span>` : ''}</span>
      <button class="cal__arrow" data-cal="${mkOf(next)}" aria-label="Next month"${canNext ? '' : ' disabled'}>${icon('next')}</button>
    </div>
    <div class="cal__grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="cal__wd">${d}</span>`).join('')}${cells.join('')}</div>
    ${ctx.habits.length ? `<div class="cal__legend"><span><i class="cal__dot"></i>Ring = habits done</span><span><i class="cal__dot is-solid"></i>Perfect Day (all Full)</span></div>
    ${tracked ? `<p class="cal__sum"><b>${perfect}</b> Perfect ${perfect === 1 ? 'Day' : 'Days'} this month</p>` : ''}` : '<p class="cal__sum">Tap a day to see its food, money and journal</p>'}
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

  // Habits (only while there are habits)
  if (st && st.total) {
    const rows = st.items.map((i) => `<li class="dd__row${i.level === 2 ? ' is-done' : i.level === 1 ? ' is-min' : ''}">
      <span class="dd__mark">${i.level ? icon('check') : ''}</span>
      <span class="dd__name">${esc(i.h.name)}</span>
      <span class="dd__val">${H.isFastFood(i.h) ? (i.n ? `${i.n} meal${i.n > 1 ? 's' : ''}${i.level ? ' · pass' : ' · over'}` : 'None') : i.level === 1 ? '2-min' : i.level === 2 ? 'Full' : ''}</span></li>`).join('');
    const perfect = st.perfect ? `<div class="dd__perfect">${icon('star')}Perfect Day: every habit done Full</div>` : '';
    parts.push(section('Habits', `${st.done}/${st.total}`, `${perfect}<ul class="dd__list">${rows}</ul>`));
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
  const moves = (ms.entries || []).filter((e) => e.date === key && e.kind !== 'checkin');
  if (moves.length) {
    const catName = (id) => (ms.categories || []).find((c) => c.id === id)?.name || 'Other';
    const label = { expense: 'Expense', income: 'Paycheck', saving: 'To savings', transfer: 'Move', adjust: 'Balance fix', cashback: 'Cash back' };
    const spent = moves.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
    const rows = moves.map((e) => `<li class="dd__row"><span class="dd__name">${esc(e.note || (e.kind === 'expense' ? catName(e.cat) : label[e.kind] || 'Entry'))}<small>${e.kind === 'expense' ? esc(catName(e.cat)) : label[e.kind] || ''}</small></span>
      <span class="dd__val dd__money${e.kind === 'income' || e.kind === 'cashback' ? ' is-in' : ''}">${e.kind === 'income' || e.kind === 'cashback' ? '+' : e.kind === 'expense' ? '−' : ''}${fmtMoney(Math.abs(e.amount), cur)}</span></li>`).join('');
    parts.push(section('Money', spent ? `${fmtMoney(spent, cur)} spent` : '', `<ul class="dd__list">${rows}</ul>`));
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


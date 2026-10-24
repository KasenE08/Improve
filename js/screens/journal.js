// Journal tab: one long note, split into a section per day (newest at the bottom).
// Today is always open for writing. Past days can be edited after a confirm pop-up.
// "Journal" on the Today tab ticks once today's section reaches the word goal.
import * as J from '../journal/store.js';
import { recheckJournal } from '../journal/autocheck.js';
import * as Stats from '../stats.js';
import { celebrate } from './today.js';
import { dayKey, fromDayKey, prettyDate } from '../dates.js';
import { esc, icon, xpbar, pct, sheet, toast, confirmBox } from '../ui.js';

const SHOW = 30; // past days shown before "Show older"
const ui = { showAll: false };
let ctx; // { root, hud }
const timers = new Map(); // pending saves per day

function label(key) {
  const d = fromDayKey(key);
  const base = prettyDate(d);
  return d.getFullYear() === new Date().getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

// Save now (and re-check the habit when today's text changed).
function save(key, text) {
  clearTimeout(timers.get(key));
  timers.delete(key);
  J.setDay(key, text);
  if (key === dayKey()) {
    const before = Stats.compute();
    const added = recheckJournal();
    ctx.hud();
    celebrate(before, Stats.compute(), added);
  }
}
function saveSoon(key, text) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => save(key, text), 400));
}
// Write anything still waiting (before a re-render or leaving the tab).
export function flush() {
  if (!ctx) return;
  for (const ta of ctx.root.querySelectorAll('textarea[data-day]')) if (timers.has(ta.dataset.day)) save(ta.dataset.day, ta.value);
}

const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };

function todayStatus(text, min) {
  const n = J.wordCount(text);
  const done = n >= min;
  return {
    n, done,
    html: `<span id="jr-count">${n}</span> / ${min} words`,
    status: done ? `${icon('check')} Journal ticked for today` : `${min - n} more word${min - n === 1 ? '' : 's'} to tick Journal`,
  };
}

export function render(root, _refresh, hud) {
  flush();
  ctx = { root, hud };
  const j = J.getJournal();
  const today = dayKey();
  const min = j.settings.minWords;
  const past = Object.keys(j.days).filter((k) => k < today).sort();
  const shown = ui.showAll ? past : past.slice(-SHOW);
  const t = todayStatus(j.days[today] || '', min);

  const days = shown.map((k) => `
    <div class="jr-day" data-day="${k}">
      <div class="jr-date"><span>${esc(label(k))}</span><span class="jr-wc">${J.wordCount(j.days[k])} words</span></div>
      <button class="jr-text" data-j="edit-past" data-day="${k}" aria-label="Edit ${esc(label(k))}">${esc(j.days[k])}</button>
    </div>`).join('');

  root.innerHTML = `<div class="screen journal">
    <section class="imp-panel">
      <header class="imp-panel__head"><h2 class="imp-panel__title">Journal</h2>
        <button class="imp-btn imp-btn--sm imp-btn--ghost jr-gear" data-j="settings" aria-label="Journal settings">${icon('cog')}</button></header>
      <div class="imp-panel__body jr-meter">
        <div class="imp-meter"><span class="imp-meter__label">Today</span>${xpbar(pct(t.n, min), 'imp-xpbar--sm')}<span class="imp-meter__val">${t.html}</span></div>
        <p class="jr-status${t.done ? ' is-on' : ''}">${t.status}</p>
      </div>
    </section>
    <section class="imp-panel jr-note">
      <div class="imp-panel__body">
        ${past.length > shown.length ? `<button class="imp-btn imp-btn--secondary imp-btn--block jr-older" data-j="older">Show ${past.length - shown.length} older day${past.length - shown.length === 1 ? '' : 's'}</button>` : ''}
        ${days || '<p class="jr-hint">Each day gets its own section here. Yesterday and earlier stay above; today is always at the bottom.</p>'}
        <div class="jr-day is-today">
          <div class="jr-date"><span>Today · ${esc(label(today))}</span></div>
          <textarea class="jr-input" data-day="${today}" placeholder="Write about your day…" rows="6">${esc(j.days[today] || '')}</textarea>
        </div>
      </div>
    </section>
  </div>`;
  const ta = root.querySelector('.jr-input');
  grow(ta);
  // Open at today (after the tab switch scrolls to the top)
  setTimeout(() => ta.scrollIntoView({ block: 'end' }), 0);
}

function updateMeter(text) {
  const min = J.getJournal().settings.minWords;
  const t = todayStatus(text, min);
  const m = ctx.root.querySelector('.jr-meter');
  if (!m) return;
  m.querySelector('.imp-meter__val').innerHTML = t.html;
  m.querySelector('.imp-xpbar').style.setProperty('--p', `${pct(t.n, min)}%`);
  const st = m.querySelector('.jr-status');
  st.innerHTML = t.status;
  st.classList.toggle('is-on', t.done);
}

async function editPast(key) {
  const ok = await confirmBox({
    title: `Edit ${label(key)}?`,
    text: 'This day is over. Are you sure you want to change it? Edits save as you type.',
    ok: 'Edit',
    icon: 'edit',
  });
  if (!ok) return;
  const btn = ctx.root.querySelector(`.jr-text[data-day="${key}"]`);
  if (!btn) return;
  const ta = document.createElement('textarea');
  ta.className = 'jr-input jr-input--past';
  ta.dataset.day = key;
  ta.value = J.getDay(key);
  btn.replaceWith(ta);
  grow(ta);
  ta.focus();
}

function openSettings() {
  const j = J.getJournal();
  sheet.open({
    title: 'Journal settings',
    body: `<label class="imp-field"><span class="imp-label">Words needed to tick "Journal"</span>
        <input class="imp-input" id="jr-min" type="number" inputmode="numeric" min="1" max="2000" value="${j.settings.minWords}"></label>
      <p class="jr-hint">Only today's section counts. Default is ${J.DEFAULT_MIN_WORDS}.</p>
      <button class="imp-btn imp-btn--primary imp-btn--block" id="jr-save">Save</button>`,
    onMount(b) {
      b.onclick = (e) => {
        if (!e.target.closest('#jr-save')) return;
        const n = parseInt(b.querySelector('#jr-min').value, 10);
        if (!(n >= 1 && n <= 2000)) return toast('Pick 1–2000 words');
        J.setMinWords(n);
        sheet.close();
        const before = Stats.compute();
        const added = recheckJournal();
        ctx.hud();
        render(ctx.root, null, ctx.hud);
        celebrate(before, Stats.compute(), added);
        toast('Saved');
      };
    },
  });
}

export function bind(root) {
  const mine = () => root.dataset.tab === 'journal';
  root.addEventListener('input', (e) => {
    if (!mine()) return;
    const ta = e.target.closest('textarea[data-day]');
    if (!ta) return;
    grow(ta);
    saveSoon(ta.dataset.day, ta.value);
    if (ta.dataset.day === dayKey()) updateMeter(ta.value);
    else {
      const wc = ta.closest('.jr-day')?.querySelector('.jr-wc');
      if (wc) wc.textContent = `${J.wordCount(ta.value)} words`;
    }
  });
  root.addEventListener('focusout', (e) => {
    if (!mine()) return;
    const ta = e.target.closest('textarea[data-day]');
    if (!ta) return;
    save(ta.dataset.day, ta.value);
    // A past day goes back to read-only text when you leave it
    if (ta.dataset.day !== dayKey()) {
      const key = ta.dataset.day;
      const text = J.getDay(key);
      if (!text) { ta.closest('.jr-day')?.remove(); return; }
      const btn = document.createElement('button');
      btn.className = 'jr-text';
      btn.dataset.j = 'edit-past';
      btn.dataset.day = key;
      btn.textContent = text;
      ta.replaceWith(btn);
    }
  });
  root.addEventListener('click', (e) => {
    if (!mine()) return;
    const el = e.target.closest('[data-j]');
    if (!el) return;
    if (el.dataset.j === 'edit-past') editPast(el.dataset.day);
    if (el.dataset.j === 'older') { ui.showAll = true; render(ctx.root, null, ctx.hud); }
    if (el.dataset.j === 'settings') openSettings();
  });
}

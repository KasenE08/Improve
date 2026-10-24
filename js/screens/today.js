// Today tab: Daily / This Week / This Month checklists, grouped by category.
import * as H from '../habits.js';
import * as R from '../rewards.js';
import * as Stats from '../stats.js';
import { daysLeft } from '../dates.js';
import { recheck } from '../food/autocheck.js';
import { AUTO, isAuto, autoTab } from '../auto.js';
import { recheckPlanner } from '../planner-auto.js';
import { recheckMoney } from '../money/autocheck.js';
import { recheckJournal } from '../journal/autocheck.js';
import { appDateFor } from '../food/logic.js';
const recheckFood = () => { recheck(appDateFor(new Date())); recheckPlanner(); recheckMoney(); recheckJournal(); };
import { esc, icon, panel, check, chip, pips, attrRow, streakTag, floatXP, toast, burst, sheet, PICKER_ICONS } from '../ui.js';

const SECTION = { daily: 'Daily', weekly: 'This Week', monthly: 'This Month' };
const PERIOD_WORD = { daily: 'today', weekly: 'this week', monthly: 'this month' };
const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const AUTO_TAB = { food: 'Food', planner: 'Planner', money: 'Money' };

let editMode = false;
let ctx; // { root, refresh }

export function render(root, refresh) {
  ctx = { root, refresh };
  const habits = H.getHabits();
  const cats = H.getCategories();
  const log = H.getLog();
  const now = new Date();
  const prog = new Map(habits.map((h) => [h.id, H.progress(h, now, log)]));
  const counts = H.countsIndex(log);
  const streaks = new Map(habits.map((h) => [h.id, R.streak(h, now, counts)]));
  const row = (h) => habitRow(h, prog.get(h.id), streaks.get(h.id));

  const toolbar = editMode
    ? `<div class="today-toolbar">
        <button class="imp-btn imp-btn--primary imp-btn--sm" data-act="new">${icon('plus')}New habit</button>
        <button class="imp-btn imp-btn--secondary imp-btn--sm" data-act="cats">Categories</button>
        <button class="imp-btn imp-btn--ghost imp-btn--sm" data-act="done-edit">Done</button>
      </div>
      <p class="today-hint imp-label">Tap a habit to edit it.</p>`
    : `<div class="today-toolbar"><span class="imp-label">Tap = done · Hold = undo</span>
        <button class="imp-btn imp-btn--secondary imp-btn--sm" data-act="edit">${icon('edit')}Edit</button></div>`;

  const sections = H.FREQS.map((freq) => {
    const list = habits.filter((h) => h.frequency === freq);
    if (!list.length) return '';
    const done = list.filter((h) => prog.get(h.id) >= h.target).length;
    const left = freq === 'daily' ? '' : ` · ${daysLeft(freq)}D left`;
    const groups = cats.map((c) => {
      const items = list.filter((h) => h.category === c.id);
      if (!items.length) return '';
      return `<div class="imp-panel__sub">${icon(c.icon)}${esc(c.name)}</div>` + items.map(row).join('');
    }).join('');
    // Habits whose category was removed
    const orphans = list.filter((h) => !cats.some((c) => c.id === h.category));
    const orphanHtml = orphans.length ? `<div class="imp-panel__sub">${icon('scroll')}Other</div>` + orphans.map(row).join('') : '';
    return panel({ title: SECTION[freq], meta: `${done}/${list.length}${left}`, body: groups + orphanHtml });
  }).join('');

  const st = Stats.compute();
  const attrs = st.categories.filter((c) => habits.some((h) => h.category === c.id)).map(attrRow).join('');

  root.innerHTML = `<div class="screen">${toolbar}${sections || emptyList()}
    ${attrs ? panel({ title: 'Attributes', meta: icon('trophy', 'imp-accent'), body: `<div class="today-stats">${attrs}</div><p class="today-note">Each category levels up from its own XP. Curves are scaled so small categories keep pace.</p>` }) : ''}
  </div>`;
}

function emptyList() {
  return panel({ title: 'No habits', body: `<p class="imp-muted" style="padding:8px 0">Tap Edit → New habit to add one.</p>` });
}

function habitRow(h, n, st) {
  const multi = h.target > 1;
  const done = n >= h.target;
  const fire = [isAuto(h) ? `<span class="today-auto">${icon(h.auto.startsWith('planner') ? 'planner' : 'food')}Auto</span>` : '', st && st.count >= 2 ? streakTag(st.count, st.current, R.UNIT[h.frequency][1]) : ''].filter(Boolean).join(' · ');
  const sub = multi
    ? `<span class="imp-row__sub">${n}/${h.target} ${PERIOD_WORD[h.frequency]}${fire ? ' · ' + fire : ''}</span>${pips(Math.min(n, h.target), h.target)}`
    : fire ? `<span class="imp-row__sub">${fire}</span>` : '';
  const end = editMode ? `<span class="imp-row__end">${icon('edit')}</span>` : chip(h.xp, done);
  return `<button class="imp-row${done ? ' is-done' : ''}" data-id="${esc(h.id)}" aria-pressed="${done}">
    ${check(done, multi && n > 0 ? n : '')}
    <span class="imp-row__main"><span class="imp-row__title">${esc(h.name)}</span>${sub}</span>
    ${end}
  </button>`;
}

// ---- Interaction: tap = +1 / toggle, long-press = −1 ----
const HOLD_MS = 450;
let holdTimer = null, held = false, startXY = null;

export function bind(root) {
  const mine = () => root.dataset.tab === 'today';
  root.addEventListener('pointerdown', (e) => {
    if (!mine()) return;
    const r = e.target.closest('.imp-row[data-id]');
    if (!r || editMode) return;
    held = false;
    startXY = [e.clientX, e.clientY];
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { held = true; apply(r.dataset.id, -1); }, HOLD_MS);
  });
  const cancel = () => clearTimeout(holdTimer);
  root.addEventListener('pointerup', cancel);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('pointermove', (e) => {
    if (startXY && Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) > 10) cancel();
  });
  root.addEventListener('contextmenu', (e) => { if (e.target.closest('.imp-row')) e.preventDefault(); });

  root.addEventListener('click', (e) => {
    if (!mine()) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'edit') { editMode = true; return ctx.refresh(); }
    if (act === 'done-edit') { editMode = false; return ctx.refresh(); }
    if (act === 'new') return openHabitForm(null);
    if (act === 'cats') return openCategories();

    const r = e.target.closest('.imp-row[data-id]');
    if (!r) return;
    if (held) { held = false; return; } // the long-press already ran
    if (editMode) return openHabitForm(H.getAllHabits().find((h) => h.id === r.dataset.id));
    apply(r.dataset.id, +1);
  });
}

function apply(id, delta) {
  const h = H.getHabits().find((x) => x.id === id);
  if (!h) return;
  if (isAuto(h)) return toast(`Auto from ${autoTab(h)} tab`);
  const before = Stats.compute();
  let change;
  if (delta > 0 && h.target === 1 && H.progress(h) >= 1) change = H.step(h, -1); // tap on a checked single habit unchecks it
  else change = H.step(h, delta);
  if (!change) {
    if (delta > 0) toast('Maxed out · hold to undo');
    return;
  }
  const added = R.sync();
  ctx.refresh();
  const el = ctx.root.querySelector(`.imp-row[data-id="${CSS.escape(id)}"]`);
  if (el) floatXP(el, change);
  celebrate(before, Stats.compute(), added);
}

// Bonus + level-up feedback
export function celebrate(before, after, added) {
  for (const b of added) {
    if (b.type === 'perfect') burst({ icon: 'star', title: 'Perfect day!', big: `+${b.xp} XP`, sub: 'Every daily habit done' });
    if (b.type === 'streak') burst({ icon: 'flame', title: `${b.n}-${b.unit.replace(/s$/, '')} streak!`, big: `+${b.xp} XP`, sub: b.name });
  }
  if (after.overall.level > before.overall.level) {
    const rankUp = after.rank.name !== before.rank.name;
    burst({ icon: 'trophy', title: 'Level up!', big: `LV ${after.overall.level}`, sub: rankUp ? `New rank: ${after.rank.name}` : after.rank.name });
  }
  for (const c of after.categories) {
    const old = before.categories.find((x) => x.id === c.id);
    if (old && c.level > old.level) toast(`${c.name} → LV ${c.level}`);
  }
}

// ---- Habit editor ----
function openHabitForm(h) {
  const isNew = !h;
  const cats = H.getCategories();
  const cur = h || { name: '', category: cats[0]?.id, frequency: 'daily', target: 1, xp: 10 };
  const autoNote = cur.auto && !AUTO[cur.auto] ? `<p class="imp-label">Will auto-check from the ${AUTO_TAB[cur.auto.split(':')[0]] || 'other'} tab in a later phase. Manual for now.</p>` : '';
  const autoField = `<label class="imp-field"><span class="imp-label">Auto-check</span><select class="imp-select" id="f-auto">
        <option value="">Off (tap to check)</option>
        ${Object.entries(AUTO).map(([k, v]) => `<option value="${k}"${cur.auto === k ? ' selected' : ''}>${v}</option>`).join('')}
        ${cur.auto && !AUTO[cur.auto] ? `<option value="${esc(cur.auto)}" selected>Later phase (${esc(cur.auto)})</option>` : ''}</select></label>`;
  sheet.open({
    title: isNew ? 'New habit' : 'Edit habit',
    body: `
      <label class="imp-field"><span class="imp-label">Name</span><input class="imp-input" id="f-name" maxlength="80" value="${esc(cur.name)}" autocomplete="off"></label>
      <label class="imp-field"><span class="imp-label">Category</span><select class="imp-select" id="f-cat">
        ${cats.map((c) => `<option value="${esc(c.id)}"${c.id === cur.category ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <div class="imp-field"><span class="imp-label">Resets</span><div class="imp-seg" id="f-freq">
        ${H.FREQS.map((f) => `<button type="button" data-f="${f}" class="${f === cur.frequency ? 'is-on' : ''}">${FREQ_LABEL[f]}</button>`).join('')}</div></div>
      <div class="imp-field-row">
        <label class="imp-field"><span class="imp-label">Times per period</span><input class="imp-input" id="f-target" type="number" inputmode="numeric" min="1" max="31" value="${cur.target}"></label>
        <label class="imp-field"><span class="imp-label">XP each</span><input class="imp-input" id="f-xp" type="number" inputmode="numeric" min="0" max="999" value="${cur.xp}"></label>
      </div>
      ${autoField}
      ${autoNote}
      <button class="imp-btn imp-btn--primary imp-btn--block" id="f-save">Save</button>
      ${isNew ? '' : '<button class="imp-btn imp-btn--danger imp-btn--block" id="f-del">' + icon('trash') + 'Delete habit</button>'}`,
    onMount(b) {
      let freq = cur.frequency;
      b.querySelector('#f-freq').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-f]');
        if (!btn) return;
        freq = btn.dataset.f;
        b.querySelectorAll('#f-freq button').forEach((x) => x.classList.toggle('is-on', x === btn));
      });
      b.querySelector('#f-save').addEventListener('click', () => {
        const name = b.querySelector('#f-name').value.trim();
        if (!name) { toast('Name needed'); return b.querySelector('#f-name').focus(); }
        const target = clampInt(b.querySelector('#f-target').value, 1, 31, 1);
        const xp = clampInt(b.querySelector('#f-xp').value, 0, 999, 10);
        const auto = b.querySelector('#f-auto').value || null;
        H.upsertHabit({ id: isNew ? H.newId('h') : h.id, name, category: b.querySelector('#f-cat').value, frequency: freq, target, xp, auto });
        recheckFood();
        R.sync();
        sheet.close();
        ctx.refresh();
        toast(isNew ? 'Habit added' : 'Saved');
      });
      b.querySelector('#f-del')?.addEventListener('click', () => {
        if (!confirm(`Delete "${h.name}"? Its past history is kept.`)) return;
        H.archiveHabit(h.id);
        R.sync();
        sheet.close();
        ctx.refresh();
        toast('Deleted');
      });
    },
  });
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

// ---- Category editor ----
function openCategories() {
  let list = H.getCategories().map((c) => ({ ...c }));
  let picking = -1;
  const used = new Set(H.getHabits().map((h) => h.category));

  const body = () => `
    <div class="cat-list">${list.map((c, i) => `
      <div class="cat-item">
        <div class="cat-row">
          <button class="cat-icon${picking === i ? ' is-on' : ''}" data-pick="${i}" aria-label="Change icon">${icon(c.icon)}</button>
          <input class="imp-input" data-name="${i}" maxlength="30" value="${esc(c.name)}" aria-label="Category name">
          <button class="imp-btn imp-btn--sm imp-btn--ghost cat-del" data-del="${i}" ${used.has(c.id) ? 'disabled' : ''} aria-label="Delete category">${icon('trash')}</button>
        </div>
        ${picking === i ? `<div class="imp-icon-grid">${PICKER_ICONS.map((k) => `<button data-icon="${k}" class="${k === c.icon ? 'is-on' : ''}">${icon(k)}</button>`).join('')}</div>` : ''}
      </div>`).join('')}
    </div>
    <p class="imp-label">Categories with habits can't be deleted. Move or delete their habits first.</p>
    <button class="imp-btn imp-btn--secondary imp-btn--block" id="c-add">${icon('plus')}Add category</button>
    <button class="imp-btn imp-btn--primary imp-btn--block" id="c-save">Save</button>`;

  sheet.open({
    title: 'Categories',
    body: body(),
    onMount(b) {
      const redraw = () => { b.innerHTML = body(); };
      b.oninput = (e) => {
        const i = e.target.dataset.name;
        if (i != null) list[+i].name = e.target.value;
      };
      b.onclick = (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.pick != null) { picking = picking === +t.dataset.pick ? -1 : +t.dataset.pick; return redraw(); }
        if (t.dataset.icon) { list[picking].icon = t.dataset.icon; picking = -1; return redraw(); }
        if (t.dataset.del != null) { list.splice(+t.dataset.del, 1); picking = -1; return redraw(); }
        if (t.id === 'c-add') { list.push({ id: H.newId('c'), name: 'New category', icon: 'star' }); picking = list.length - 1; return redraw(); }
        if (t.id === 'c-save') {
          list = list.map((c) => ({ ...c, name: c.name.trim() || 'Untitled' }));
          H.saveCategories(list);
          sheet.close();
          ctx.refresh();
          toast('Saved');
        }
      };
    },
  });
}

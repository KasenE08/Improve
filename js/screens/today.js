// Today tab: Daily / This Week / This Month checklists, grouped by category.
import * as H from '../habits.js';
import * as R from '../rewards.js';
import * as Stats from '../stats.js';
import { daysLeft, appNow, nextStart, dayKey, fromDayKey } from '../dates.js';
import { monthlyOpen, MONTHLY_START } from '../launch.js';
import { recheck } from '../food/autocheck.js';
import { AUTO, isAuto, autoTab } from '../auto.js';
import { recheckPlanner } from '../planner-auto.js';
import { recheckMoney } from '../money/autocheck.js';
import { recheckJournal } from '../journal/autocheck.js';
import { appDateFor } from '../food/logic.js';
const recheckFood = () => { recheck(appDateFor(new Date())); recheckPlanner(); recheckMoney(); recheckJournal(); };
import { esc, icon, panel, check, pips, streakTag, toast, burst, sheet, confirmBox, PICKER_ICONS } from '../ui.js';

const SECTION = { daily: 'Daily', weekly: 'This Week', monthly: 'This Month' };
const PERIOD_WORD = { daily: 'today', weekly: 'this week', monthly: 'this month' };
const PERIOD_END = { daily: 'day end', weekly: 'week end', monthly: 'month end' };
const OFF_LABEL = { daily: 'Day', weekly: 'Week', monthly: 'Month' };
// Auto habits show the icon of the tab they tick from
const AUTO_ICON = { food: 'food', planner: 'planner', money: 'wallet', journal: 'quill' };
const OFF_WHY = { 'planner:work': 'nothing planned', 'money:save': 'no payday' };
// Shown under an auto habit so its rule isn't forgotten
const AUTO_NOTE = {}; // a short rule under an auto habit, by its auto id (none right now)
const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const startLabel = fromDayKey(MONTHLY_START).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const AUTO_TAB = { food: 'Food', planner: 'Planner', money: 'Money' };

const editMode = false; // editing is a long-press now (kept so older row code reads the same)
let view = 'daily'; // which list is showing: daily | weekly | monthly
let ctx; // { root, refresh }

export function render(root, refresh) {
  ctx = { root, refresh };
  const habits = H.getHabits();
  const cats = H.getCategories();
  const log = H.getLog();
  const now = appNow();
  const prog = new Map(habits.map((h) => [h.id, H.progress(h, now, log)]));
  const counts = H.countsIndex(log);
  const streaks = new Map(habits.map((h) => [h.id, R.streak(h, now, counts)]));
  const ex = H.getExcused();
  const isOff = (h) => H.offIn(h, now, ex);
  const ov = H.getOverrides();
  const row = (h) => habitRow(h, prog.get(h.id), streaks.get(h.id), isOff(h), isAuto(h) && H.isOverridden(h, now, ov));

  // One list at a time: Daily / Weekly / Monthly
  const statsFor = (freq) => {
    const counted = habits.filter((h) => h.frequency === freq && !isOff(h)); // days/weeks off don't count either way
    return { done: counted.filter((h) => H.isDone(h, prog.get(h.id))).length, total: counted.length };
  };
  const seg = `<div class="imp-seg hab-seg" role="tablist">${H.FREQS.map((f) => {
    const st = statsFor(f);
    return `<button role="tab" aria-selected="${f === view}" data-view="${f}" class="${f === view ? 'is-on' : ''}">${FREQ_LABEL[f]}<small>${st.done}/${st.total}</small></button>`;
  }).join('')}</div>`;
  const freq = view;
  const list = habits.filter((h) => h.frequency === freq);
  const resetDay = nextStart(freq).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const waiting = freq === 'monthly' && !monthlyOpen(dayKey(now));
  const info = freq === 'daily' ? '' : waiting ? `Monthly habits start Mon ${startLabel}` : `${daysLeft(freq)} ${daysLeft(freq) === 1 ? 'day' : 'days'} left · resets ${resetDay}`;
  const groups = cats.map((c) => {
    const items = list.filter((h) => h.category === c.id);
    if (!items.length) return '';
    return `<div class="imp-panel__sub">${icon(c.icon)}${esc(c.name)}</div>` + items.map(row).join('');
  }).join('');
  // Habits whose category was removed
  const orphans = list.filter((h) => !cats.some((c) => c.id === h.category));
  const orphanHtml = orphans.length ? `<div class="imp-panel__sub">${icon('scroll')}Other</div>` + orphans.map(row).join('') : '';
  const sections = list.length
    ? `<section class="imp-panel hab-list"><div class="imp-panel__body">${groups + orphanHtml}</div></section>`
    : `<p class="hab-empty">No ${FREQ_LABEL[freq].toLowerCase()} habits. Tap + to add one.</p>`;
  const foot = `<div class="hab-foot"><span>Hold a habit to edit it</span><button class="hab-cats" data-act="cats">Edit categories</button></div>`;

  root.innerHTML = `<div class="screen hab">${seg}${info ? `<p class="hab-info">${info}</p>` : ''}${sections}${foot}</div>`;
}

function emptyList() {
  return panel({ title: 'No habits', body: `<p class="imp-muted" style="padding:8px 0">Tap Edit → New habit to add one.</p>` });
}

function habitRow(h, n, st, dayOff, manual) {
  if (dayOff && !n) {
    const end = editMode ? `<span class="imp-row__end">${icon('edit')}</span>` : '';
    return `<button class="imp-row is-waiting" data-id="${esc(h.id)}">
    ${check(false, '')}
    <span class="imp-row__main"><span class="imp-row__title">${esc(h.name)}</span><span class="imp-row__sub">${OFF_LABEL[h.frequency]} off · ${OFF_WHY[h.auto] || 'nothing to do'}${st && st.count >= 2 ? ' · ' + streakTag(st.count, st.current, R.UNIT[h.frequency][1]) : ''}</span></span>
    ${end}
  </button>`;
  }
  if (H.isLimit(h) && !H.notStarted(h)) return limitRow(h, n, st);
  const multi = h.target > 1;
  const done = n >= h.target;
  if (H.notStarted(h)) {
    const end = editMode ? `<span class="imp-row__end">${icon('edit')}</span>` : '';
    return `<button class="imp-row is-waiting" data-id="${esc(h.id)}" aria-disabled="true">
    ${check(false, '')}
    <span class="imp-row__main"><span class="imp-row__title">${esc(h.name)}</span><span class="imp-row__sub">Starts Mon ${startLabel}</span></span>
    ${end}
  </button>`;
  }
  const fire = [manual ? `<span class="today-auto">${icon('edit')}Manual</span>`
    : isAuto(h) ? `<span class="today-auto">${icon(AUTO_ICON[h.auto.split(':')[0]] || 'info')}Auto${h.autoAfter != null ? ` · ${fmtClock(h.autoAfter)}+` : ''}</span>` : '', st && st.count >= 2 ? streakTag(st.count, st.current, R.UNIT[h.frequency][1]) : ''].filter(Boolean).join(' · ');
  const note = isAuto(h) && !manual && AUTO_NOTE[h.auto] ? `<span class="imp-row__note">${AUTO_NOTE[h.auto]}</span>` : '';
  const sub = (multi
    ? `<span class="imp-row__sub">${n}/${h.target} ${PERIOD_WORD[h.frequency]}${fire ? ' · ' + fire : ''}</span>${pips(Math.min(n, h.target), h.target)}`
    : fire ? `<span class="imp-row__sub">${fire}</span>` : '') + note;
  const end = editMode ? `<span class="imp-row__end">${icon('edit')}</span>` : '';
  return `<button class="imp-row${done ? ' is-done' : ''}" data-id="${esc(h.id)}" aria-pressed="${done}">
    ${check(done)}
    <span class="imp-row__main"><span class="imp-row__title">${esc(h.name)}</span>${sub}</span>
    ${end}
  </button>`;
}

// Limit habit ("at most N"): tap counts a use. At or under the limit = done.
function limitRow(h, n, st) {
  const over = n > h.target;
  const left = h.target - n;
  const state = over ? `Over by ${n - h.target}` : left === 0 ? 'At the limit' : `On track · ${left} left`;
  const fire = st && st.count >= 2 ? ' · ' + streakTag(st.count, st.current, R.UNIT[h.frequency][1]) : '';
  const end = editMode ? `<span class="imp-row__end">${icon('edit')}</span>` : '';
  return `<button class="imp-row is-limit${over ? ' is-over' : ''}" data-id="${esc(h.id)}" aria-label="${esc(h.name)}: ${n} of at most ${h.target}">
    <span class="imp-check imp-limit-box${over ? ' is-over' : ''}"></span>
    <span class="imp-row__main"><span class="imp-row__title">${esc(h.name)}</span>
      <span class="imp-row__sub">${n}/${h.target} max ${PERIOD_WORD[h.frequency]} · ${state}${fire}</span>
      ${limitDots(n, h.target)}</span>
    ${end}
  </button>`;
}

// Uses so far against the max: filled dots, red ones past the max
function limitDots(n, max) {
  const total = Math.min(12, Math.max(n, max));
  if (!total) return '';
  return `<span class="imp-pips">${Array.from({ length: total }, (_, i) => `<span class="imp-pip${i < n ? (i >= max ? ' is-over' : ' is-on') : ''}"></span>`).join('')}</span>`;
}

// ---- Interaction: tap = +1 / toggle (tap a finished one to undo one), hold = edit ----
const HOLD_MS = 450;
let holdTimer = null, held = false, startXY = null;

export function bind(root) {
  const mine = () => root.dataset.tab === 'today';
  root.addEventListener('pointerdown', (e) => {
    if (!mine()) return;
    const r = e.target.closest('.imp-row[data-id]');
    if (!r) return;
    held = false;
    startXY = [e.clientX, e.clientY];
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      held = true;
      navigator.vibrate?.(10);
      openHabitForm(H.getAllHabits().find((h) => h.id === r.dataset.id));
    }, HOLD_MS);
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
    const v = e.target.closest('[data-view]')?.dataset.view;
    if (v) { view = v; return ctx.refresh(); }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cats') return openCategories();

    const r = e.target.closest('.imp-row[data-id]');
    if (!r) return;
    if (held) { held = false; return; } // the long-press opened the editor
    apply(r.dataset.id, +1);
  });
}

function apply(id, delta) {
  const h = H.getHabits().find((x) => x.id === id);
  if (!h) return;
  if (H.notStarted(h)) return toast(`Monthly habits start Mon ${startLabel}`);
  if (H.isLimit(h)) return applyLimit(h, delta);
  if (isAuto(h)) return applyOverride(h);
  const before = Stats.compute();
  const n0 = H.progress(h);
  if (delta > 0 && n0 >= h.target) H.step(h, -1); // tap on a finished habit undoes one
  else H.step(h, delta);
  if (H.progress(h) === n0) {
    if (delta > 0) toast('Nothing to change');
    return;
  }
  const added = R.sync();
  ctx.refresh();
  celebrate(before, Stats.compute(), added);
}

// Auto habits: tap to tick it yourself for this period (override), tap again to hand it back to auto
let overrideOpen = false;
async function applyOverride(h) {
  if (overrideOpen) return;
  overrideOpen = true;
  const on = H.isOverridden(h);
  const word = PERIOD_WORD[h.frequency];
  const ok = await confirmBox(on
    ? { title: 'Back to auto?', text: `Removes your manual tick. The ${autoTab(h)} tab decides ${word} again.`, ok: 'Back to auto', icon: 'info' }
    : { title: 'Tick it yourself?', text: `Auto from the ${autoTab(h)} tab. Counts as done ${word}, and the auto check won't undo it.`, ok: 'Tick it', icon: 'check' });
  overrideOpen = false;
  if (!ok) return;
  const before = Stats.compute();
  H.setOverride(h, !on);
  if (on) recheckFood(); // let auto put it back if it's earned
  const added = R.sync();
  ctx.refresh();
  celebrate(before, Stats.compute(), added);
}

function applyLimit(h, delta) {
  const before = Stats.compute();
  const n0 = H.progress(h);
  H.step(h, delta);
  const n1 = H.progress(h);
  if (n0 === n1) return;
  const added = R.sync();
  ctx.refresh();
  if (n1 > h.target && n0 <= h.target) toast(`Over the limit ${PERIOD_WORD[h.frequency]}`);
  else if (n1 <= h.target && n0 > h.target) toast('Back on track');
  else toast(`${n1}/${h.target} ${PERIOD_WORD[h.frequency]}`);
  celebrate(before, Stats.compute(), added);
}

// Big moments: Perfect Day, streak milestones, a limit kept. (XP and levels are hidden; the history keeps them.)
export function celebrate(_before, _after, added) {
  for (const b of added) {
    if (b.type === 'limit') {
      if (b.unit === 'day') toast(`${b.name}: stayed at ${b.n}/${b.max}`);
      else burst({ icon: 'shield', title: 'Held the line', big: `${b.n}/${b.max}`, sub: `${b.name} last ${b.unit}` });
    }
    if (b.type === 'perfect') burst({ icon: 'star', title: 'Perfect Day', big: '', sub: 'Every daily habit done today' });
    if (b.type === 'streak') burst({ icon: 'flame', title: `${b.n}-${b.unit.replace(/s$/, '')} streak`, big: '', sub: b.name });
  }
}

// ---- Habit editor ----
export function openHabitForm(h) {
  const isNew = !h;
  const cats = H.getCategories();
  const cur = h || { name: '', category: cats[0]?.id, frequency: 'daily', target: 1, xp: 10 };
  const limit0 = H.isLimit(cur);
  const autoNote = cur.auto && !AUTO[cur.auto] ? `<p class="imp-label">Will auto-check from the ${AUTO_TAB[cur.auto.split(':')[0]] || 'other'} tab in a later phase. Manual for now.</p>` : '';
  const autoField = `<label class="imp-field"><span class="imp-label">Auto-check</span><select class="imp-select" id="f-auto">
        <option value="">Off (tap to check)</option>
        ${Object.entries(AUTO).map(([k, v]) => `<option value="${k}"${cur.auto === k ? ' selected' : ''}>${v}</option>`).join('')}
        ${cur.auto && !AUTO[cur.auto] ? `<option value="${esc(cur.auto)}" selected>Later phase (${esc(cur.auto)})</option>` : ''}</select></label>
      <label class="imp-field" id="f-after-wrap"${cur.auto ? '' : ' hidden'}><span class="imp-label">Only tick after (optional)</span>
        <input class="imp-input" id="f-after" type="time" value="${cur.autoAfter == null ? '' : minToTime(cur.autoAfter)}"></label>`;
  // Multi-step habits and limits: undo one from here (a tap on a finished one also undoes one)
  const nNow = h ? H.progress(h) : 0;
  const undoRow = h && nNow > 0 && (h.target > 1 || H.isLimit(h))
    ? `<div class="hab-undo"><span>${H.isLimit(h) ? `${nNow} ${nNow === 1 ? 'time' : 'times'}` : `${nNow}/${h.target}`} ${PERIOD_WORD[h.frequency]}</span><button type="button" class="imp-btn imp-btn--secondary imp-btn--sm" id="f-undo">Undo one</button></div>`
    : '';
  sheet.open({
    title: isNew ? 'New habit' : 'Edit habit',
    body: `${undoRow}
      <label class="imp-field"><span class="imp-label">Name</span><input class="imp-input" id="f-name" maxlength="80" value="${esc(cur.name)}" autocomplete="off"></label>
      <label class="imp-field"><span class="imp-label">Category</span><select class="imp-select" id="f-cat">
        ${cats.map((c) => `<option value="${esc(c.id)}"${c.id === cur.category ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <div class="imp-field"><span class="imp-label">Resets</span><div class="imp-seg" id="f-freq">
        ${H.FREQS.map((f) => `<button type="button" data-f="${f}" class="${f === cur.frequency ? 'is-on' : ''}">${FREQ_LABEL[f]}</button>`).join('')}</div></div>
      <div class="imp-field"><span class="imp-label">Type</span><div class="imp-seg" id="f-kind">
        <button type="button" data-k="goal" class="${limit0 ? '' : 'is-on'}">Goal · do it</button>
        <button type="button" data-k="limit" class="${limit0 ? 'is-on' : ''}">Limit · at most</button></div></div>
      <label class="imp-field"><span class="imp-label" id="f-target-l">${limit0 ? 'Max times per period' : 'Times per period'}</span><input class="imp-input" id="f-target" type="number" inputmode="numeric" min="${limit0 ? 0 : 1}" max="31" value="${cur.target}"></label>
      <p class="imp-label" id="f-limit-note"${limit0 ? '' : ' hidden'}>Tap each time it happens. Staying at or under the max counts as done.</p>
      <div id="f-auto-wrap"${limit0 ? ' hidden' : ''}>${autoField}</div>
      ${autoNote}
      <button class="imp-btn imp-btn--primary imp-btn--block" id="f-save">Save</button>
      ${isNew ? '' : '<button class="imp-btn imp-btn--danger imp-btn--block" id="f-del">' + icon('trash') + 'Delete habit</button>'}`,
    onMount(b) {
      b.querySelector('#f-undo')?.addEventListener('click', () => {
        H.step(h, -1);
        R.sync();
        sheet.close();
        ctx.refresh();
        toast('Undid one');
      });
      let freq = cur.frequency;
      let kind = limit0 ? 'limit' : 'goal';
      b.querySelector('#f-kind').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-k]');
        if (!btn) return;
        kind = btn.dataset.k;
        const lim = kind === 'limit';
        b.querySelectorAll('#f-kind button').forEach((x) => x.classList.toggle('is-on', x === btn));
        b.querySelector('#f-target-l').textContent = lim ? 'Max times per period' : 'Times per period';
        b.querySelector('#f-target').min = lim ? 0 : 1;
        b.querySelector('#f-limit-note').hidden = !lim;
        b.querySelector('#f-auto-wrap').hidden = lim;
      });
      // The time option only applies to auto-checked habits
      b.querySelector('#f-auto').addEventListener('change', (e) => { b.querySelector('#f-after-wrap').hidden = !e.target.value; });
      b.querySelector('#f-freq').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-f]');
        if (!btn) return;
        freq = btn.dataset.f;
        b.querySelectorAll('#f-freq button').forEach((x) => x.classList.toggle('is-on', x === btn));
      });
      b.querySelector('#f-save').addEventListener('click', () => {
        const name = b.querySelector('#f-name').value.trim();
        if (!name) { toast('Name needed'); return b.querySelector('#f-name').focus(); }
        const lim = kind === 'limit';
        const target = clampInt(b.querySelector('#f-target').value, lim ? 0 : 1, 31, lim ? 2 : 1);
        const xp = Number.isFinite(cur.xp) ? cur.xp : 10; // XP is hidden; the stored value is kept
        const auto = lim ? null : b.querySelector('#f-auto').value || null;
        const afterVal = b.querySelector('#f-after').value;
        const autoAfter = auto && afterVal ? timeToMin(afterVal) : null;
        const id = isNew ? H.newId('h') : h.id;
        H.upsertHabit({ id, name, category: b.querySelector('#f-cat').value, frequency: freq, target, xp, auto, autoAfter,
          kind: lim ? 'limit' : 'goal', limitSince: lim ? (limit0 && cur.limitSince) || dayKey(appNow()) : null });
        if (lim && !limit0 && !isNew) H.clearPeriodXP(H.getHabits().find((x) => x.id === id)); // its taps this period become uses, not XP
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

const pad2 = (n) => String(n).padStart(2, '0');
const minToTime = (m) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
const timeToMin = (t) => { const [hh, mm] = t.split(':').map(Number); return hh * 60 + mm; };
// "3 PM", "9:30 AM"
export function fmtClock(m) {
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h % 12 || 12}${mm ? ':' + pad2(mm) : ''} ${h < 12 ? 'AM' : 'PM'}`;
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

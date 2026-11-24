// Habits tab: one daily list, grouped by category. A habit shows only on the days it's scheduled
// (Sunday check-in on Sundays, Save % on paydays, Lift until 5 sessions this week).
// Tap the box: Full. Hold the box: 2-min. Tap the rest of the row: its cue / craving / response / reward card.
// Hold the rest of the row: edit.
import * as H from '../habits.js';
import * as R from '../rewards.js';
import * as Stats from '../stats.js';
import { appNow, dayKey, fromDayKey } from '../dates.js';
import { recheck } from '../food/autocheck.js';
import { AUTO, isAuto, autoTab } from '../auto.js';
import { recheckMoney } from '../money/autocheck.js';
import { recheckJournal } from '../journal/autocheck.js';
import { appDateFor } from '../food/logic.js';
const recheckFood = () => { recheck(appDateFor(new Date())); recheckMoney(); recheckJournal(); };
import { esc, icon, checkLevel, streakBadge, streakBurst, perfectBurst, toast, sheet, confirmBox, tickReward, PICKER_ICONS } from '../ui.js';

// Auto habits show the icon of the tab they tick from
const AUTO_ICON = { food: 'food', money: 'wallet', journal: 'quill' };
const CARD = [['cue', 'Cue'], ['craving', 'Craving'], ['response', 'Response'], ['reward', 'Reward'], ['twoMin', '2-min'], ['full', 'Full']];
const open = new Set(); // rows showing their card
let ctx; // { root, refresh }

export function render(root, refresh) {
  ctx = { root, refresh };
  const now = appNow();
  const today = dayKey(now);
  const habits = H.getHabits();
  const cats = H.getCategories();
  const rc = R.makeCtx();
  const ov = H.getOverrides();
  const shown = habits.filter((h) => (H.isFastFood(h) ? !H.isExcused(h.id, today, rc.ex) : R.isScheduled(h, today, rc)));
  const row = (h) => habitRow(h, R.streak(h, now, null, rc), isAuto(h) && H.isOverridden(h, now, ov), rc);
  const done = shown.filter((h) => (H.isFastFood(h) ? H.usesOn(h, today, rc.log) === 0 : H.levelOn(h, today, rc.log) > 0)).length;
  const groups = cats.map((c) => {
    const items = shown.filter((h) => h.category === c.id);
    if (!items.length) return '';
    return `<div class="imp-panel__sub">${icon(c.icon)}${esc(c.name)}</div>` + items.map(row).join('');
  }).join('');
  const orphans = shown.filter((h) => !cats.some((c) => c.id === h.category));
  const orphanHtml = orphans.length ? `<div class="imp-panel__sub">${icon('scroll')}Other</div>` + orphans.map(row).join('') : '';
  const hidden = habits.length - shown.length;
  const sections = shown.length
    ? `<section class="imp-panel hab-list"><div class="imp-panel__body">${groups + orphanHtml}</div></section>`
    : '<p class="hab-empty">Nothing scheduled today. Tap + to add a habit.</p>';
  const head = `<div class="hab-head"><span><b>${done}</b>/${shown.length} today</span>${hidden ? `<span>${hidden} not on today</span>` : ''}</div>`;
  const foot = `<div class="hab-foot"><span>Tap ✓ Full · hold ✓ 2-min · tap a habit for its card · hold it to edit</span><button class="hab-cats" data-act="cats">Edit categories</button></div>`;
  root.innerHTML = `<div class="screen hab">${head}${sections}${foot}</div>`;
}

// Streak badge on the right (from 2 in a row) and the row's gold / silver look at the top flame level
const hasStreak = (st) => st && st.count >= 2;
const lvOf = (st) => Math.max(1, R.tier(st.count, 'daily'));
function badge(h, st) {
  if (!hasStreak(st)) return '';
  const warn = H.isFastFood(h) ? 'no passes left' : 'go Full today';
  return streakBadge({ count: st.count, atRisk: st.atRisk, lv: lvOf(st), unit: R.unitOf(h)[1], warn });
}
function rowLook(st) {
  if (!hasStreak(st)) return '';
  return (lvOf(st) >= 4 ? (st.atRisk ? ' is-silver' : ' is-gold') : '') + (st.atRisk ? ' is-risk' : '');
}

function card(h) {
  const rows = CARD.map(([k, label]) => {
    const v = k === 'twoMin' ? (H.hasMin(h) ? h.twoMin : 'None · Full only') : h[k];
    return v ? `<div class="hab-card__row"><dt>${label}</dt><dd>${esc(v)}</dd></div>` : '';
  }).join('');
  return `<dl class="hab-card"${open.has(h.id) ? '' : ' hidden'}>${rows || '<div class="hab-card__row"><dd>Hold to add a cue, craving, response and reward.</dd></div>'}</dl>`;
}

// Lift: sessions this week as 5 dots (half dot = a 2-min session)
function liftDots(h, now, rc) {
  const s = R.liftDone(h, now, rc.log);
  const ws = new Date(now); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
  const lv = [];
  for (let i = 0; i < 7; i++) { const d = new Date(ws); d.setDate(ws.getDate() + i); const l = H.levelOn(h, dayKey(d), rc.log); if (l) lv.push(l); }
  const t = h.target || 5;
  const dots = Array.from({ length: Math.max(t, lv.length) }, (_, i) => `<span class="imp-pip${lv[i] === 2 ? ' is-on' : lv[i] === 1 ? ' is-half' : ''}"></span>`).join('');
  return `<span class="hab-sub-line"><b>${s}/${t}</b> this week <span class="imp-pips">${dots}</span></span>`;
}

function habitRow(h, st, manual, rc) {
  const now = appNow();
  if (H.isFastFood(h)) return fastFoodRow(h, st, rc);
  const level = st.level;
  const auto = isAuto(h);
  const bits = [];
  if (manual) bits.push(`<span class="today-auto">${icon('edit')}Manual</span>`);
  else if (auto) bits.push(`<span class="today-auto">${icon(AUTO_ICON[h.auto.split(':')[0]] || 'info')}Auto</span>`);
  if (level === 1) bits.push('<span class="hab-tag">2-min</span>');
  if (hasStreak(st) && st.atRisk) bits.push('<b class="imp-missed">2-min last time</b>');
  const sub = H.isLift(h) ? liftDots(h, now, rc) + (bits.length ? `<span class="imp-row__sub">${bits.join(' · ')}</span>` : '')
    : bits.length ? `<span class="imp-row__sub">${bits.join(' · ')}</span>` : '';
  return `<div class="hab-item" data-item="${esc(h.id)}"><div class="imp-row hab-row${level === 2 ? ' is-done' : level === 1 ? ' is-min' : ''}${rowLook(st)}" data-id="${esc(h.id)}">
    <button class="hab-box" data-act="check" aria-label="${esc(h.name)}: ${level === 2 ? 'done Full' : level === 1 ? 'done 2-min' : 'not done'}">${checkLevel(level)}</button>
    <span class="imp-row__main" data-act="card"><span class="imp-row__title">${esc(h.name)}</span>${h.rule ? `<span class="imp-row__rule">${esc(h.rule)}</span>` : ''}${sub}</span>
    ${badge(h, st)}</div>${card(h)}</div>`;
}

// Fast food: looks like Lift. The box logs a meal (it shows today's count in blue); the line under it is the week's passes.
function fastFoodRow(h, st, rc) {
  const now = appNow();
  const used = R.passesUsed(h, now, rc.log);
  const max = h.target;
  const today = H.usesOn(h, dayKey(now), rc.log);
  const over = used > max;
  const pips = Array.from({ length: Math.max(max, used) }, (_, i) => `<span class="imp-pip${i < used ? (i >= max ? ' is-over' : ' is-on') : ''}"></span>`).join('');
  const box = `<span class="imp-check${today ? ' is-count' : ''}">${today ? `<span class="imp-check__count">${today}</span>` : ''}</span>`;
  const note = over ? '<span class="imp-row__sub"><b class="imp-missed">Over the passes: streak reset</b></span>' : '';
  return `<div class="hab-item" data-item="${esc(h.id)}"><div class="imp-row hab-row is-ff${over ? ' is-over' : ''}${rowLook(st)}" data-id="${esc(h.id)}">
    <button class="hab-box" data-act="meal" aria-label="Log a fast food meal (${today} today)">${box}</button>
    <span class="imp-row__main" data-act="card"><span class="imp-row__title">${esc(h.name)}</span>
      <span class="hab-sub-line"><b>${Math.min(used, 99)}/${max}</b> this week <span class="imp-pips">${pips}</span></span>${note}</span>
    ${badge(h, st)}</div>${card(h)}</div>`;
}

// ---- Interaction: tap the box = Full, hold the box = 2-min; tap the rest = card, hold the rest = edit ----
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
    const onBox = e.target.closest('[data-act="check"]');
    const onMeal = e.target.closest('[data-act="meal"]');
    holdTimer = setTimeout(() => {
      held = true;
      navigator.vibrate?.(10);
      const h = H.getAllHabits().find((x) => x.id === r.dataset.id);
      if (onMeal) undoMeal(h);
      else if (onBox) holdBox(h, r);
      else openHabitForm(h);
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
    if (e.target.closest('[data-act="cats"]')) return openCategories();
    const r = e.target.closest('.imp-row[data-id]');
    if (!r) return;
    if (held) { held = false; return; } // a hold already did its thing
    const h = H.getHabits().find((x) => x.id === r.dataset.id);
    if (!h) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'meal') return logMeal(h);
    if (act === 'check') return tapBox(h, r);
    toggleCard(h.id, r); // anywhere else on the row
  });
}

function toggleCard(id, r) {
  const c = r.parentElement.querySelector('.hab-card');
  if (open.has(id)) open.delete(id); else open.add(id);
  if (c) c.hidden = !open.has(id);
  r.classList.toggle('is-open', open.has(id));
}

// Tap the box: Full (tap again to undo). An auto habit you ticked by hand goes back to auto.
function tapBox(h, r) {
  const level = H.levelOn(h, dayKey(appNow()));
  if (isAuto(h) && H.isOverridden(h)) return handBack(h);
  if (isAuto(h) && level === H.FULL) return toast(`Done Full (auto from ${autoTab(h)})`);
  setLevel(h, level === H.FULL ? 0 : H.FULL, r);
}

// Hold the box: the 2-minute version (hold again to undo). Full-only habits don't have one.
function holdBox(h, r) {
  if (!h || H.isFastFood(h)) return;
  if (!H.hasMin(h)) return toast('Full only: no 2-min version');
  const level = H.levelOn(h, dayKey(appNow()));
  if (isAuto(h) && H.isOverridden(h)) return handBack(h);
  setLevel(h, level === H.MIN ? 0 : H.MIN, r);
}

function setLevel(h, level, r) {
  const before = Stats.compute();
  const today = dayKey(appNow());
  const from = H.levelOn(h, today);
  if (from === level) return;
  if (isAuto(h)) {
    if (level) H.setOverride(h, true, appNow(), level); // ticked by hand: the auto-check leaves it alone today
    else { H.setOverride(h, false); recheckFood(); }
  } else H.setLevel(h, today, level);
  const added = R.sync();
  const box = r?.querySelector('.hab-box');
  ctx.refresh();
  if (level > from) {
    const fresh = ctx.root.querySelector(`.imp-row[data-id="${CSS.escape(h.id)}"] .hab-box`) || box;
    tickReward(fresh, level);
  }
  celebrate(before, Stats.compute(), added);
}

// Hand a habit you ticked yourself back to its auto-check
function handBack(h) {
  const before = Stats.compute();
  H.setOverride(h, false);
  recheckFood();
  const added = R.sync();
  ctx.refresh();
  toast(`Back to auto (${autoTab(h)} tab)`);
  celebrate(before, Stats.compute(), added);
}

// Hold the fast food box: take back the last meal logged this week
function undoMeal(h) {
  if (!h || !R.passesUsed(h)) return toast('No meals this week');
  const before = Stats.compute();
  H.step(h, -1);
  const added = R.sync();
  ctx.refresh();
  toast(`Meal removed · ${R.passesUsed(h)}/${h.target} this week`);
  celebrate(before, Stats.compute(), added);
}

// Fast food: one more meal (a pass). Going past the week's passes resets the streak, so it asks first.
async function logMeal(h) {
  const used = R.passesUsed(h);
  if (used >= h.target) {
    const ok = await confirmBox({ title: `Pass ${used + 1}?`, text: `You've used ${used}/${h.target} this week. Going over resets the streak to 0.`, ok: 'Log it', icon: 'info' });
    if (!ok) return;
  }
  const before = Stats.compute();
  H.step(h, +1);
  const added = R.sync();
  ctx.refresh();
  const u = R.passesUsed(h);
  toast(u > h.target ? 'Over the passes: streak reset' : `Pass ${u}/${h.target} used`);
  celebrate(before, Stats.compute(), added);
}

// Big moments: Perfect Day / Week / Month and streak milestones. (XP and levels are hidden; the history keeps them.)
export function celebrate(_before, _after, added) {
  // Perfect Day / Week / Month: only the biggest one earned shows
  const pm = added.find((b) => b.type === 'perfectMonth'), pw = added.find((b) => b.type === 'perfectWeek'), pd = added.find((b) => b.type === 'perfect');
  const rng = (b) => `${fromDayKey(b.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${fromDayKey(b.to).getDate()}`;
  if (pm) { const d = fromDayKey(pm.to); perfectBurst('month', { count: d.getDate(), sub: `All ${d.getDate()} days of ${d.toLocaleDateString('en-US', { month: 'long' })}` }); }
  else if (pw) perfectBurst('week', { sub: `7 Perfect Days · ${rng(pw)}` });
  else if (pd) perfectBurst('day', { sub: 'Every habit done Full today' });
  for (const b of added) {
    if (b.type === 'streak') {
      const unit = b.unit === 'sessions' ? 'sessions' : 'days';
      streakBurst({ n: b.n, unit, lv: Math.max(1, R.tier(b.n, 'daily')), name: b.name, newFlame: R.isNewTier(b.n, 'daily') });
    }
  }
}

// ---- Habit editor ----
export function openHabitForm(h) {
  const isNew = !h;
  const cats = H.getCategories();
  const cur = h || { name: '', category: cats[0]?.id, frequency: 'daily', target: 1, xp: 10, kind: 'goal', days: 'daily' };
  const special = H.isLift(cur) ? 'Sessions per week' : H.isFastFood(cur) ? 'Passes per week' : null;
  const autoField = `<label class="imp-field"><span class="imp-label">Auto-check</span><select class="imp-select" id="f-auto">
        <option value="">Off (tap to check)</option>
        ${Object.entries(AUTO).filter(([k]) => k !== 'money:review').map(([k, v]) => `<option value="${k}"${cur.auto === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="imp-field" id="f-after-wrap"${cur.auto ? '' : ' hidden'}><span class="imp-label">Only tick after (optional)</span>
        <input class="imp-input" id="f-after" type="time" value="${cur.autoAfter == null ? '' : minToTime(cur.autoAfter)}"></label>`;
  const ffUndo = h && H.isFastFood(h) && R.passesUsed(h) > 0
    ? `<div class="hab-undo"><span>${R.passesUsed(h)} this week</span><button type="button" class="imp-btn imp-btn--secondary imp-btn--sm" id="f-undo">Undo one meal</button></div>` : '';
  const text = (id, label, v, ph = '') => `<label class="imp-field"><span class="imp-label">${label}</span><textarea class="imp-input hab-ta" id="${id}" rows="2" maxlength="240" placeholder="${esc(ph)}">${esc(v || '')}</textarea></label>`;
  const daysSel = `<label class="imp-field"><span class="imp-label">Shows</span><select class="imp-select" id="f-days">
      ${[['daily', 'Every day'], ['sun', 'Sundays'], ['payday', 'Paydays']].map(([k, v]) => `<option value="${k}"${(cur.days || 'daily') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`;
  sheet.open({
    title: isNew ? 'New habit' : 'Edit habit',
    body: `${ffUndo}
      <label class="imp-field"><span class="imp-label">Name</span><input class="imp-input" id="f-name" maxlength="80" value="${esc(cur.name)}" autocomplete="off"></label>
      <label class="imp-field"><span class="imp-label">Subtitle (optional)</span><input class="imp-input" id="f-rule" maxlength="80" value="${esc(cur.rule || '')}" placeholder="Shown under the name" autocomplete="off"></label>
      <label class="imp-field"><span class="imp-label">Category</span><select class="imp-select" id="f-cat">
        ${cats.map((c) => `<option value="${esc(c.id)}"${c.id === cur.category ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${special ? `<label class="imp-field"><span class="imp-label">${special}</span><input class="imp-input" id="f-target" type="number" inputmode="numeric" min="1" max="14" value="${cur.target}"></label>` : daysSel}
      ${text('f-twomin', '2-min version (blank = Full only)', cur.twoMin, 'e.g. 2 pages')}
      ${text('f-full', 'Full', cur.full, 'e.g. 10 pages')}
      ${text('f-cue', 'Cue', cur.cue, 'What reminds you')}
      ${text('f-craving', 'Craving', cur.craving, 'Why you want it')}
      ${text('f-response', 'Response', cur.response, 'How it stays easy')}
      ${text('f-reward', 'Reward', cur.reward, 'What you get')}
      ${special ? '' : `<div id="f-auto-wrap">${autoField}</div>`}
      <button class="imp-btn imp-btn--primary imp-btn--block" id="f-save">Save</button>
      ${isNew ? '' : '<button class="imp-btn imp-btn--danger imp-btn--block" id="f-del">' + icon('trash') + 'Delete habit</button>'}`,
    onMount(b) {
      b.querySelector('#f-undo')?.addEventListener('click', () => {
        H.step(h, -1);
        R.sync();
        sheet.close();
        ctx.refresh();
        toast('Undid one meal');
      });
      // The time option only applies to auto-checked habits
      b.querySelector('#f-auto')?.addEventListener('change', (e) => { b.querySelector('#f-after-wrap').hidden = !e.target.value; });
      b.querySelector('#f-save').addEventListener('click', () => {
        const name = b.querySelector('#f-name').value.trim();
        if (!name) { toast('Name needed'); return b.querySelector('#f-name').focus(); }
        const val = (id) => b.querySelector(id)?.value.trim() || null;
        const xp = Number.isFinite(cur.xp) ? cur.xp : 10; // XP is hidden; the stored value is kept
        const auto = special ? null : b.querySelector('#f-auto').value || null;
        const afterVal = b.querySelector('#f-after')?.value;
        const autoAfter = auto && afterVal ? timeToMin(afterVal) : null;
        const id = isNew ? H.newId('h') : h.id;
        H.upsertHabit({
          id, name, rule: val('#f-rule'), category: b.querySelector('#f-cat').value, frequency: 'daily', xp, auto, autoAfter,
          kind: cur.kind || 'goal', days: special ? 'daily' : b.querySelector('#f-days').value,
          target: special ? clampInt(b.querySelector('#f-target').value, 1, 14, cur.target) : 1,
          twoMin: val('#f-twomin'), full: val('#f-full'), cue: val('#f-cue'), craving: val('#f-craving'), response: val('#f-response'), reward: val('#f-reward'),
          ...(isNew ? { since: dayKey(appNow()) } : {}),
        });
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

// Food tab. Ported from KasenE08/calorie-tracker js/app.js and restyled with the
// Improve design system. Same features: week strip, calories-remaining number,
// calorie + protein bars, meal tabs, saved foods (servings or grams), quick add,
// saved meals, Repeat, editable entries, goals. Plus: auto-checks habits.
import * as L from '../food/logic.js';
import * as F from '../food/store.js';
import * as Auto from '../food/autocheck.js';
import * as Imp from '../food/import.js';
import * as Stats from '../stats.js';
import { celebrate } from './today.js';
import { esc, icon, xpbar, toast, sheet } from '../ui.js';

const now = () => new Date();
const today = () => L.appDateFor(now());
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const shortDate = (iso) => L.fromISODate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const SUBS = [['today', 'Today'], ['foods', 'Foods'], ['meals', 'Meals'], ['goals', 'Goals']];
const WATER_STEPS = [8, 16, 32];
const fmtOz = (n) => (Math.round(n * 10) / 10).toLocaleString('en-US');

// UI state. `stack` holds pages opened on top of the current sub-tab.
const ui = { sub: 'today', date: today(), mealTab: L.mealForTime(now()), stack: [], slide: '', foodsQuery: '' };
const page = () => ui.stack[ui.stack.length - 1];
const draftPage = () => ui.stack.find((p) => p.view === 'meal-form');

let ctx; // { root, refresh }
const rerender = () => ctx.refresh();
function push(p) { ui.stack.push(p); rerender(); window.scrollTo(0, 0); }
function pop() { ui.stack.pop(); rerender(); }
function popAll() { ui.stack = []; rerender(); }
function backToDraft() { while (page() && page().view !== 'meal-form') ui.stack.pop(); rerender(); }

function selectDate(date) {
  ui.date = date;
  if (date === today()) ui.mealTab = L.mealForTime(now());
}

// Any change to food data: re-check habits for that date, then celebrate XP / levels.
function changed(date, fn) {
  const before = Stats.compute();
  fn();
  const added = Auto.recheck(date);
  return () => celebrate(before, Stats.compute(), added);
}

// ---------- Render ----------
export function render(root, refresh) {
  ctx = { root, refresh };
  // If the app stayed open past 4:01 AM, follow "today" forward.
  if (ui.shownToday && ui.shownToday !== today() && ui.date === ui.shownToday && !page()) selectDate(today());
  ui.shownToday = today();

  const p = page();
  if (p) {
    root.innerHTML = `<div class="screen food">${PAGES[p.view](p)}</div>`;
    if (p.view === 'pick') fillPickList(p);
    return;
  }
  const subnav = `<div class="imp-seg food-subnav">${SUBS.map(([id, label]) => `<button data-f="sub" data-sub="${id}" class="${ui.sub === id ? 'is-on' : ''}">${label}</button>`).join('')}</div>`;
  root.innerHTML = `<div class="screen food">${subnav}${SUB_TABS[ui.sub]()}</div>`;
  if (ui.sub === 'foods') fillFoodsList();
  ui.slide = '';
}

const PAGES = { pick: renderPick, log: renderLog, quick: renderQuick, 'food-form': renderFoodForm, 'meal-form': renderMealForm, repeat: renderRepeat, 'import-confirm': renderImportConfirm };
const SUB_TABS = { today: renderDay, foods: renderFoods, meals: renderMeals, goals: renderGoals };

const box = (title, body, meta = '') => `<section class="imp-panel"><header class="imp-panel__head"><h2 class="imp-panel__title">${title}</h2><span class="imp-panel__meta">${meta}</span></header><div class="imp-panel__body">${body}</div></section>`;

function dayTitle(date) {
  const t = today();
  if (date === t) return 'Today';
  if (date === L.addDays(t, -1)) return 'Yesterday';
  if (date === L.addDays(t, 1)) return 'Tomorrow';
  return L.fromISODate(date).toLocaleDateString('en-US', { weekday: 'long' });
}

function entryDetail(e) {
  if (e.kind === 'quick') return 'Quick add';
  if (e.unit === 'grams') return `${fmt(e.amount)} g`;
  return `${plural(e.amount, 'serving')} · ${fmt(Math.round(e.amount * e.snapshot.servingGrams))} g`;
}

const avatar = (e) => `<span class="food-av${e.kind === 'quick' ? ' is-quick' : ''}">${e.kind === 'quick' ? '+' : esc(e.name.charAt(0).toUpperCase())}</span>`;
const calPro = (cal, pro) => `<span class="food-c">${fmt(cal)} cal</span> · <span class="food-p">${fmt(pro)} g</span>`;

// Week strip: Mon–Sun, a pixel bar per day (cyan, red when over the calorie goal).
function weekStrip() {
  const start = L.weekStartOf(ui.date);
  const t = today();
  const goal = F.getGoals().calGoal;
  const days = L.weekDates(start).map((date) => {
    const eaten = L.totals(F.entriesFor(date)).cal;
    const p = L.progress(eaten, goal);
    const d = L.fromISODate(date);
    return `<button class="wk-day${date === ui.date ? ' is-sel' : ''}${date === t ? ' is-today' : ''}${p.over ? ' is-over' : ''}" data-f="pick-day" data-date="${date}" aria-label="${shortDate(date)}">
      <span class="wk-dow">${d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)}</span>
      <span class="wk-num">${d.getDate()}</span>
      <span class="wk-bar"><span style="height:${Math.round(p.pct * 100)}%"></span></span></button>`;
  }).join('');
  return `<div class="wk" data-swipe="week">
    <button class="wk-arrow" data-f="week" data-dir="-1" aria-label="Previous week">◂</button>
    <div class="wk-days ${ui.slide}">${days}</div>
    <button class="wk-arrow" data-f="week" data-dir="1" aria-label="Next week">▸</button></div>`;
}

function hero(day) {
  const g = F.getGoals();
  const cal = L.progress(day.cal, g.calGoal);
  const pro = L.progress(day.protein, g.proteinGoal);
  const hits = Auto.hitsFor(ui.date);
  const oz = F.waterFor(ui.date);
  const lo = Math.round(g.calGoal * (1 - g.calRange / 100)), hi = Math.round(g.calGoal * (1 + g.calRange / 100));
  const tick = (on, label, hint) => `<span class="food-hit${on ? ' is-on' : ''}"><span class="imp-check${on ? ' is-on' : ''}">${icon('check')}</span><span>${label}<small>${hint}</small></span></span>`;
  return `<div class="food-hero${cal.over ? ' is-over' : ''}">
    <div class="food-big" data-testid="remaining">${L.formatSigned(cal.remaining)}</div>
    <div class="food-cap">cal remaining</div>
    <div class="food-bar"><div class="food-bar__top"><span class="imp-label food-c">Calories</span><span class="food-val" data-testid="cal-val">${fmt(cal.eaten)} <small>/ ${fmt(cal.goal)}</small></span></div>
      ${xpbar(Math.round(cal.pct * 100), cal.over ? 'imp-xpbar--over' : '')}</div>
    <div class="food-bar"><div class="food-bar__top"><span class="imp-label food-p">Protein</span><span class="food-val" data-testid="pro-val">${fmt(pro.eaten)} <small>/ ${fmt(pro.goal)} g</small></span></div>
      ${xpbar(Math.round(pro.pct * 100), 'imp-xpbar--protein')}</div>
    <div class="food-bar"><div class="food-bar__top"><span class="imp-label food-w">Water</span><span class="food-val" data-testid="water-val">${fmtOz(oz)} <small>/ ${fmt(g.waterGoal)} oz</small></span></div>
      ${xpbar(Math.min(100, Math.round((oz / g.waterGoal) * 100)), 'imp-xpbar--water')}
      <div class="food-water">${WATER_STEPS.map((n) => `<button class="imp-btn imp-btn--sm imp-btn--secondary" data-f="water" data-oz="${n}">+${n}</button>`).join('')}
        <button class="imp-btn imp-btn--sm imp-btn--secondary" data-f="water-custom" aria-label="Add a custom amount of water">+?</button>
        <button class="imp-btn imp-btn--sm imp-btn--secondary" data-f="water" data-oz="-8" aria-label="Remove 8 oz" ${oz > 0 ? '' : 'disabled'}>−8</button></div></div>
    <div class="food-hits">${tick(hits['food:calories'], 'Hit calories', `${fmt(lo)}–${fmt(hi)}`)}${tick(hits['food:protein'], 'Hit protein', `${fmt(g.proteinMin)} g+`)}${tick(hits['food:water'], 'Hit water', `${fmt(g.waterGoal)} oz+`)}</div>
  </div>`;
}

function renderDay() {
  const entries = F.entriesFor(ui.date);
  const day = L.totals(entries);
  const meal = ui.mealTab;
  const list = entries.filter((e) => e.meal === meal);
  const sub = L.totals(list);
  const tabs = L.MEALS.map((m) => {
    const t = L.totals(entries.filter((e) => e.meal === m));
    return `<button class="${m === meal ? 'is-on' : ''}" data-f="meal-tab" data-meal="${m}"><span>${L.MEAL_LABELS[m]}</span><b>${fmt(t.cal)}</b></button>`;
  }).join('');
  const rows = list.length ? list.map((e) => `
    <button class="food-row" data-f="edit-entry" data-id="${e.id}">${avatar(e)}
      <span class="food-row__mid"><span class="food-row__name">${esc(e.name)}</span><span class="food-row__sub">${entryDetail(e)}</span></span>
      <span class="food-row__val"><span class="food-c">${fmt(e.cal)}</span><span class="food-p">${fmt(e.protein)} g</span></span>
    </button>`).join('')
    : `<p class="food-empty">Nothing logged for ${L.MEAL_LABELS[meal]} yet.</p>`;
  const date = L.fromISODate(ui.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `${box(`${dayTitle(ui.date)} · ${date}`, `${weekStrip()}${hero(day)}`, ui.date === today() ? '' : '<button class="imp-btn imp-btn--sm imp-btn--secondary" data-f="go-today">Today</button>')}
    <section class="imp-panel">
      <div class="food-mealtabs">${tabs}</div>
      <div class="imp-panel__body">
        ${rows}
        <div class="food-subtotal"><span class="imp-label">${L.MEAL_LABELS[meal]} total</span><span>${calPro(sub.cal, sub.protein)}</span></div>
        <div class="imp-btn-row food-add">
          <button class="imp-btn imp-btn--primary" data-f="open-pick">${icon('plus')}Add food</button>
          <button class="imp-btn imp-btn--secondary" data-f="open-quick">Quick</button>
          <button class="imp-btn imp-btn--secondary" data-f="open-repeat">Repeat</button>
        </div>
        ${list.length ? `<button class="imp-btn imp-btn--ghost imp-btn--sm" data-f="save-as-meal">Save ${L.MEAL_LABELS[meal]} as a meal</button>` : ''}
      </div>
    </section>`;
}

const searchBox = (id, value = '', placeholder = 'Search saved foods') =>
  `<input class="imp-input" id="${id}" type="search" placeholder="${placeholder}" value="${esc(value)}" autocomplete="off" autocorrect="off" spellcheck="false">`;

function renderFoods() {
  return box('Saved foods', `<div class="food-stack">
    <button class="imp-btn imp-btn--primary imp-btn--block" data-f="new-food">${icon('plus')}New food</button>
    ${searchBox('foods-search', ui.foodsQuery)}
    <div id="foods-list"></div></div>`);
}

const foodRows = (foods, act) => foods.map((f) => `
  <button class="food-row" data-f="${act}" data-id="${f.id}">
    <span class="food-row__mid"><span class="food-row__name">${esc(f.name)}</span><span class="food-row__sub">per ${fmt(f.servingGrams)} g serving</span></span>
    <span class="food-row__val"><span class="food-c">${fmt(f.cal)} cal</span><span class="food-p">${fmt(f.protein)} g</span></span>
  </button>`).join('');

const noFoods = (all) => `<p class="food-empty">${all.length ? 'No foods match your search.' : 'No saved foods yet. Tap New food to add one.'}</p>`;

function fillFoodsList() {
  const all = F.getState().foods;
  const foods = L.searchFoods(all, document.getElementById('foods-search').value);
  document.getElementById('foods-list').innerHTML = foods.length ? foodRows(foods, 'edit-food') : noFoods(all);
}

function fillPickList(p) {
  const q = document.getElementById('pick-search').value;
  const all = F.getState().foods;
  const foods = L.searchFoods(all, q);
  let html = '';
  if (!p.toDraft) {
    const meals = L.searchFoods(F.getState().savedMeals, q);
    if (meals.length) html += `<div class="imp-panel__sub">Saved meals</div>${meals.map((m) => savedMealRow(m)).join('')}<div class="imp-panel__sub">Foods</div>`;
  }
  html += foods.length ? foodRows(foods, 'pick-food') : noFoods(all);
  document.getElementById('pick-list').innerHTML = html;
}

function savedMealRow(m, { editable = false } = {}) {
  const t = L.totals(F.mealItemsForAdding(m).map(L.entryFieldsFromItem));
  return `<div class="food-mealrow">
    <button class="food-row" data-f="${editable ? 'edit-meal' : 'add-meal'}" data-id="${m.id}">
      <span class="food-row__mid"><span class="food-row__name">${esc(m.name)}</span><span class="food-row__sub">${plural(m.items.length, 'item')} · ${calPro(t.cal, t.protein)}</span></span>
    </button>
    <button class="imp-btn imp-btn--sm imp-btn--primary" data-f="add-meal" data-id="${m.id}">Add</button>
  </div>`;
}

function renderMeals() {
  const meals = F.getState().savedMeals;
  const groups = L.MEALS.map((cat) => {
    const list = L.searchFoods(meals.filter((m) => m.category === cat), '');
    return list.length ? `<div class="imp-panel__sub">${L.MEAL_LABELS[cat]}</div>${list.map((m) => savedMealRow(m, { editable: true })).join('')}` : '';
  }).join('');
  return box('Saved meals', `<div class="food-stack">
    <button class="imp-btn imp-btn--primary imp-btn--block" data-f="new-meal">${icon('plus')}New meal</button>
    ${groups || '<p class="food-empty">No saved meals yet. Build one with New meal, or open a meal on Today and tap Save as a meal.</p>'}
    ${meals.length ? `<p class="food-note">Add puts the meal on ${ui.date === today() ? 'today' : shortDate(ui.date)}, in the meal for the current time.</p>` : ''}</div>`);
}

const field = (id, label, value, unit, mode = 'numeric', cls = '') =>
  `<label class="imp-field"><span class="imp-label ${cls}">${label}</span><span class="food-unit"><input class="imp-input" id="${id}" inputmode="${mode}" value="${esc(value)}"><span>${unit}</span></span></label>`;

function renderGoals() {
  const g = F.getGoals();
  return `${box('Daily goals', `<div class="food-stack">
      <div class="imp-field-row">${field('g-cal', 'Calorie goal', g.calGoal, 'cal', 'numeric', 'food-c')}${field('g-range', 'Hit range ±', g.calRange, '%')}</div>
      <div class="imp-field-row">${field('g-pro', 'Protein goal', g.proteinGoal, 'g', 'numeric', 'food-p')}${field('g-min', 'Hit at least', g.proteinMin, 'g')}</div>
      <div class="imp-field-row">${field('g-water', 'Water goal', g.waterGoal, 'oz', 'numeric', 'food-w')}</div>
      <p class="food-err" id="g-err"></p>
      <button class="imp-btn imp-btn--primary imp-btn--block" data-f="save-goals">Save goals</button>
      <p class="food-note">"Hit calories" ticks when you're within the range of your goal. "Hit protein" ticks at the minimum. Your water habit ticks at the water goal. All update on the Today tab as you log.</p></div>`)}
    ${box('Copy from Calorie Tracker', `<div class="food-stack">
      <p class="food-note">One-time copy of your old app's foods, meals and log. The old app is only read, never changed.</p>
      <p class="food-note">On iPhone: open Calorie Tracker → Settings → Export backup → Save to Files. Then pick that file here.</p>
      <button class="imp-btn imp-btn--primary imp-btn--block" data-f="import-file">Choose backup file</button>
      <button class="imp-btn imp-btn--secondary imp-btn--block" data-f="import-direct">Copy directly (same browser only)</button>
      <p class="food-err" id="import-err"></p>
      <input type="file" id="food-import" accept="application/json,.json" hidden></div>`)}
    ${box('Backup', '<p class="food-note">Food data is included in Improve\'s backup on the Profile tab.</p>')}`;
}

const longDate = (iso) => L.fromISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function renderImportConfirm(p) {
  const s = p.summary;
  const cur = F.getState();
  return `${nav('Copy from Calorie Tracker')}
    ${box('Replace food data?', `<div class="food-stack">
      <ul class="food-list">
        <li>${plural(s.entries, 'logged entry').replace('entrys', 'entries')}${s.days ? ` over ${plural(s.days, 'day')} (${longDate(s.first)} – ${longDate(s.last)})` : ''}</li>
        <li>${plural(s.foods, 'saved food')}</li>
        <li>${plural(s.savedMeals, 'saved meal')}</li>
        ${p.data.settings.calGoal ? `<li>Calorie goal ${fmt(p.data.settings.calGoal)} (your protein goal + hit rules stay as set here)</li>` : ''}
      </ul>
      <p class="food-warn">This replaces Improve's food data (now ${plural(cur.entries.length, 'entry').replace('entrys', 'entries')}, ${plural(cur.foods.length, 'food')}). Past days aren't re-checked for habits; today's food day is.</p>
      <button class="imp-btn imp-btn--danger imp-btn--block" data-f="import-confirm">Copy into Improve</button>
      <button class="imp-btn imp-btn--ghost imp-btn--block" data-f="back">Cancel</button></div>`)}`;
}

const nav = (title) => `<div class="food-nav"><button class="imp-btn imp-btn--sm imp-btn--secondary" data-f="back">◂ Back</button><span class="imp-panel__title">${esc(title)}</span></div>`;

function renderPick(p) {
  return `${nav(p.toDraft ? 'Add to meal' : 'Add food')}
    ${box('Pick', `<div class="food-stack">
      <div class="imp-btn-row"><button class="imp-btn imp-btn--secondary imp-btn--sm" data-f="new-food-then-log">${icon('plus')}New food</button>
        <button class="imp-btn imp-btn--secondary imp-btn--sm" data-f="open-quick">${p.toDraft ? 'Quick item' : 'Quick add'}</button></div>
      ${searchBox('pick-search', '', p.toDraft ? 'Search saved foods' : 'Search foods and meals')}
      <div id="pick-list"></div></div>`)}`;
}

const mealSelector = (selected, act = 'pick-meal') =>
  `<div class="imp-seg">${L.MEALS.map((m) => `<button class="${m === selected ? 'is-on' : ''}" data-f="${act}" data-meal="${m}">${L.MEAL_LABELS[m]}</button>`).join('')}</div>`;

function renderLog(p) {
  const amount = parseFloat(p.amountStr) || 0;
  const r = L.scale(p.snap, p.unit, amount);
  const unitLabel = p.unit === 'grams' ? 'grams' : amount === 1 ? 'serving' : 'servings';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
  const editing = p.entryId || p.itemIndex != null;
  const cta = editing ? 'Save changes' : p.toDraft ? 'Add to meal' : `Add to ${L.MEAL_LABELS[p.meal]}`;
  const title = p.toDraft ? (editing ? 'Edit item' : 'Add item') : editing ? 'Edit entry' : 'Log food';
  return `${nav(title)}
    ${box(esc(p.name), `<div class="food-stack">
      <p class="food-note">Serving ${fmt(p.snap.servingGrams)} g · ${fmt(p.snap.cal)} cal · ${fmt(p.snap.protein)} g protein</p>
      <div class="imp-seg"><button class="${p.unit === 'servings' ? 'is-on' : ''}" data-f="unit" data-unit="servings">Servings</button>
        <button class="${p.unit === 'grams' ? 'is-on' : ''}" data-f="unit" data-unit="grams">Grams</button></div>
      <div class="food-amt"><span class="food-amt__n" data-testid="amount">${esc(p.amountStr)}</span><span class="imp-label">${unitLabel}</span></div>
      <div class="food-res"><div><b class="food-c">${fmt(r.cal)}</b><span class="imp-label">Calories</span></div><div><b class="food-p">${fmt(r.protein)} g</b><span class="imp-label">Protein</span></div></div>
      ${p.toDraft ? '' : mealSelector(p.meal)}
      <div class="food-pad">${keys.map((k) => `<button data-f="key" data-key="${k}">${k}</button>`).join('')}</div>
      <button class="imp-btn imp-btn--primary imp-btn--block" data-f="save-log" ${amount > 0 ? '' : 'disabled'}>${cta}</button>
      ${editing ? `<button class="imp-btn imp-btn--danger imp-btn--block" data-f="delete-entry">${icon('trash')}${p.toDraft ? 'Remove item' : 'Delete entry'}</button>` : ''}
    </div>`)}`;
}

function renderQuick(p) {
  const src = p.entryId ? F.getEntry(p.entryId) : p.itemIndex != null ? draftPage().draft.items[p.itemIndex] : null;
  const val = (k) => (src ? (k === 'label' ? (src.name === 'Quick add' ? '' : src.name) : src[k]) : '');
  const title = p.toDraft ? (src ? 'Edit quick item' : 'Quick item') : src ? 'Edit quick add' : 'Quick add';
  const cta = src ? 'Save changes' : p.toDraft ? 'Add to meal' : `Add to <span id="q-meal">${L.MEAL_LABELS[p.meal]}</span>`;
  return `${nav(title)}
    ${box(title, `<div class="food-stack">
      <label class="imp-field"><span class="imp-label">Label (optional)</span><input class="imp-input" id="q-label" placeholder="e.g. Coffee with milk" value="${esc(val('label'))}" autocomplete="off"></label>
      <div class="imp-field-row">${field('q-cal', 'Calories', val('cal'), 'cal', 'numeric', 'food-c')}${field('q-pro', 'Protein', val('protein'), 'g', 'numeric', 'food-p')}</div>
      ${p.toDraft ? '' : mealSelector(p.meal)}
      <p class="food-err" id="q-err"></p>
      <button class="imp-btn imp-btn--primary imp-btn--block" data-f="save-quick">${cta}</button>
      ${src ? `<button class="imp-btn imp-btn--danger imp-btn--block" data-f="delete-entry">${icon('trash')}${p.toDraft ? 'Remove item' : 'Delete entry'}</button>` : ''}
    </div>`)}`;
}

function renderFoodForm(p) {
  const f = p.foodId ? F.getFood(p.foodId) : null;
  const v = (k) => (f ? f[k] : '');
  return `${nav(f ? 'Edit food' : 'New food')}
    ${box(f ? 'Edit food' : 'New food', `<div class="food-stack">
      <label class="imp-field"><span class="imp-label">Name</span><input class="imp-input" id="f-name" placeholder="e.g. Chicken breast" value="${esc(v('name'))}" autocomplete="off"></label>
      ${field('f-grams', 'Serving size', v('servingGrams'), 'g', 'decimal')}
      <div class="imp-field-row">${field('f-cal', 'Cal / serving', v('cal'), 'cal', 'numeric', 'food-c')}${field('f-pro', 'Protein / serving', v('protein'), 'g', 'decimal', 'food-p')}</div>
      <p class="food-err" id="f-err"></p>
      <button class="imp-btn imp-btn--primary imp-btn--block" data-f="save-food">${f ? 'Save food' : 'Create food'}</button>
      ${f ? `<button class="imp-btn imp-btn--danger imp-btn--block" data-f="delete-food">${icon('trash')}Delete food</button><p class="food-note">Changes here won't affect anything you've already logged.</p>` : ''}
    </div>`)}`;
}

function renderMealForm(p) {
  const d = p.draft;
  const t = L.totals(d.items.map(L.entryFieldsFromItem));
  const items = d.items.length ? d.items.map((it, i) => {
    const e = L.entryFieldsFromItem(it);
    return `<div class="food-mealrow">
      <button class="food-row" data-f="edit-item" data-i="${i}">${avatar(it)}
        <span class="food-row__mid"><span class="food-row__name">${esc(it.name)}</span><span class="food-row__sub">${entryDetail({ ...it, ...e })}</span></span>
        <span class="food-row__val"><span class="food-c">${fmt(e.cal)}</span><span class="food-p">${fmt(e.protein)} g</span></span></button>
      <button class="imp-btn imp-btn--sm imp-btn--ghost food-x" data-f="remove-item" data-i="${i}" aria-label="Remove ${esc(it.name)}">${icon('close')}</button>
    </div>`;
  }).join('') : '<p class="food-empty">No items yet. Add foods or a quick item.</p>';
  return `${nav(d.id ? 'Edit meal' : 'New meal')}
    ${box(d.id ? 'Edit meal' : 'New meal', `<div class="food-stack">
      <label class="imp-field"><span class="imp-label">Meal name</span><input class="imp-input" id="m-name" placeholder="e.g. Usual breakfast" value="${esc(d.name)}" autocomplete="off"></label>
      <div class="imp-field"><span class="imp-label">Category</span>${mealSelector(d.category, 'pick-cat')}</div>
      <div class="imp-panel__sub">Items</div>
      <div>${items}</div>
      <div class="food-subtotal"><span class="imp-label">Total</span><span>${calPro(t.cal, t.protein)}</span></div>
      <div class="imp-btn-row"><button class="imp-btn imp-btn--secondary imp-btn--sm" data-f="draft-add-food">${icon('plus')}Add food</button>
        <button class="imp-btn imp-btn--secondary imp-btn--sm" data-f="draft-add-quick">${icon('plus')}Quick item</button></div>
      <p class="food-err" id="m-err"></p>
      <button class="imp-btn imp-btn--primary imp-btn--block" data-f="save-meal">Save meal</button>
      ${d.id ? `<button class="imp-btn imp-btn--danger imp-btn--block" data-f="delete-meal">${icon('trash')}Delete meal</button>` : ''}
    </div>`)}`;
}

function renderRepeat(p) {
  const blocks = [];
  for (let i = 1; i <= p.days; i++) {
    const date = L.addDays(ui.date, -i);
    const entries = F.entriesFor(date);
    const rows = L.MEALS.map((m) => {
      const list = entries.filter((e) => e.meal === m);
      if (!list.length) return '';
      const t = L.totals(list);
      return `<button class="food-row" data-f="repeat-meal" data-date="${date}" data-meal="${m}">
        <span class="food-row__mid"><span class="food-row__name">${L.MEAL_LABELS[m]}</span><span class="food-row__sub food-row__sub--wrap">${esc(list.map((e) => e.name).join(', '))}</span></span>
        <span class="food-row__val"><span class="food-c">${fmt(t.cal)}</span><span class="food-p">${fmt(t.protein)} g</span></span></button>`;
    }).join('');
    if (rows) blocks.push(`<div class="imp-panel__sub">${dayTitle(date) === 'Yesterday' ? 'Yesterday' : shortDate(date)}</div>${rows}`);
  }
  return `${nav('Repeat a meal')}
    ${box('Repeat', `<div class="food-stack">
      <p class="food-note">Copies into ${ui.date === today() ? 'today' : shortDate(ui.date)}, in the meal for the current time (${L.MEAL_LABELS[L.mealForTime(now())]}). You can edit or move items afterward.</p>
      <div>${blocks.join('') || `<p class="food-empty">Nothing logged in the ${p.days} days before ${shortDate(ui.date)}.</p>`}</div>
      <button class="imp-btn imp-btn--secondary imp-btn--block" data-f="repeat-more">Show older days</button></div>`)}`;
}

// ---------- Page openers ----------
function openLogNew(food, toDraft) {
  push({ view: 'log', toDraft, foodId: food.id, name: food.name, snap: { servingGrams: food.servingGrams, cal: food.cal, protein: food.protein },
    unit: 'servings', amountStr: '1', fresh: true, meal: L.mealForTime(now()) });
}
function openEditEntry(e) {
  if (e.kind === 'quick') return push({ view: 'quick', entryId: e.id, meal: e.meal });
  push({ view: 'log', entryId: e.id, name: e.name, snap: e.snapshot, unit: e.unit, amountStr: String(e.amount), fresh: true, meal: e.meal });
}
function openEditItem(i) {
  const it = draftPage().draft.items[i];
  if (it.kind === 'quick') return push({ view: 'quick', toDraft: true, itemIndex: i });
  push({ view: 'log', toDraft: true, itemIndex: i, foodId: it.foodId, name: it.name, snap: it.snapshot, unit: it.unit, amountStr: String(it.amount), fresh: true });
}
const itemFromEntry = (e) => (e.kind === 'quick'
  ? { kind: 'quick', name: e.name, cal: e.cal, protein: e.protein }
  : { kind: 'food', foodId: e.foodId, name: e.name, unit: e.unit, amount: e.amount, snapshot: { ...e.snapshot } });

function saveDraftItem(p, item) {
  const items = draftPage().draft.items;
  if (p.itemIndex != null) items[p.itemIndex] = item; else items.push(item);
  backToDraft();
}

function pressKey(p, k) {
  let s = p.fresh ? '' : p.amountStr;
  p.fresh = false;
  if (k === '⌫') s = s.slice(0, -1);
  else if (k === '.') { if (!s.includes('.')) s = (s || '0') + '.'; }
  else if (s === '0') s = k;
  else if (s.length < 6) s += k;
  p.amountStr = s || '0';
}

const num = (id) => {
  const raw = document.getElementById(id).value.trim();
  return raw === '' ? NaN : Number(raw);
};

// Back to the day view after adding, then show any XP / level moments.
function finish(meal, msg, after) {
  ui.sub = 'today';
  ui.mealTab = meal;
  popAll();
  toast(msg);
  after && after();
}
const addedMsg = (what, meal) => `${what} ${L.MEAL_LABELS[meal]}${ui.date === today() ? '' : ` · ${shortDate(ui.date)}`}`;

// ---------- Events ----------
let suppressClick = false;
let swipe = null;

export function bind(root) {
  const mine = () => root.dataset.tab === 'food';

  root.addEventListener('click', (ev) => {
    if (!mine()) return;
    if (suppressClick) { suppressClick = false; return; }
    const el = ev.target.closest('[data-f]');
    if (!el) return;
    const p = page();
    const act = el.dataset.f;

    switch (act) {
      case 'sub': ui.sub = el.dataset.sub; rerender(); break;
      case 'meal-tab': ui.mealTab = el.dataset.meal; rerender(); break;
      case 'back': pop(); break;
      case 'pick-day': selectDate(el.dataset.date); rerender(); break;
      case 'week': changeWeek(Number(el.dataset.dir)); break;
      case 'go-today': selectDate(today()); rerender(); break;

      case 'water': {
        const oz = Number(el.dataset.oz);
        const after = changed(ui.date, () => F.addWater(ui.date, oz));
        rerender();
        toast(oz > 0 ? `+${oz} oz water` : `${oz} oz water`);
        after();
        break;
      }
      case 'water-custom': openWaterSheet(); break;
      case 'open-pick': push({ view: 'pick' }); break;
      case 'open-quick': push({ view: 'quick', toDraft: p?.toDraft, meal: L.mealForTime(now()) }); break;
      case 'open-repeat': push({ view: 'repeat', days: 14 }); break;
      case 'repeat-more': p.days += 14; rerender(); break;
      case 'new-food': push({ view: 'food-form' }); break;
      case 'new-food-then-log': push({ view: 'food-form', thenLog: true, toDraft: p.toDraft }); break;
      case 'edit-food': push({ view: 'food-form', foodId: el.dataset.id }); break;
      case 'pick-food': openLogNew(F.getFood(el.dataset.id), p.toDraft); break;
      case 'edit-entry': openEditEntry(F.getEntry(el.dataset.id)); break;

      case 'pick-meal':
        p.meal = el.dataset.meal;
        if (p.view === 'quick') { // keep what's been typed
          el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b === el));
          const label = document.getElementById('q-meal');
          if (label) label.textContent = L.MEAL_LABELS[p.meal];
        } else rerender();
        break;

      case 'unit': {
        const to = el.dataset.unit;
        if (to === p.unit) break;
        p.amountStr = String(L.convertAmount(p.snap, p.unit, to, parseFloat(p.amountStr) || 0));
        p.unit = to;
        p.fresh = true;
        rerender();
        break;
      }
      case 'key': pressKey(p, el.dataset.key); rerender(); break;

      case 'save-log': {
        const amount = parseFloat(p.amountStr);
        if (!(amount > 0)) break;
        if (p.toDraft) {
          saveDraftItem(p, { kind: 'food', foodId: p.foodId, name: p.name, unit: p.unit, amount, snapshot: { ...p.snap } });
        } else if (p.entryId) {
          const date = F.getEntry(p.entryId).date;
          finish(p.meal, 'Saved', changed(date, () => F.updateEntry(p.entryId, { unit: p.unit, amount, meal: p.meal })));
        } else {
          finish(p.meal, addedMsg('Added to', p.meal), changed(ui.date, () => F.logFood(F.getFood(p.foodId), { date: ui.date, meal: p.meal, unit: p.unit, amount })));
        }
        break;
      }
      case 'save-quick': {
        const cal = num('q-cal');
        const protein = num('q-pro');
        const err = document.getElementById('q-err');
        if (!(cal >= 0)) { err.textContent = 'Enter calories.'; break; }
        if (protein < 0) { err.textContent = 'Protein must be 0 or more.'; break; }
        const label = document.getElementById('q-label').value.trim();
        const data = { cal: Math.round(cal), protein: Math.round(protein || 0) };
        if (p.toDraft) {
          saveDraftItem(p, { kind: 'quick', name: label || 'Quick add', ...data });
        } else if (p.entryId) {
          const date = F.getEntry(p.entryId).date;
          finish(p.meal, 'Saved', changed(date, () => F.updateEntry(p.entryId, { name: label || 'Quick add', ...data, meal: p.meal })));
        } else {
          finish(p.meal, addedMsg('Added to', p.meal), changed(ui.date, () => F.quickAdd({ label, ...data, meal: p.meal, date: ui.date })));
        }
        break;
      }
      case 'delete-entry':
        if (p.toDraft) { draftPage().draft.items.splice(p.itemIndex, 1); backToDraft(); break; }
        if (confirm('Delete this entry?')) {
          const date = F.getEntry(p.entryId).date;
          const after = changed(date, () => F.deleteEntry(p.entryId));
          popAll();
          toast('Deleted');
          after();
        }
        break;

      case 'save-food': {
        const name = document.getElementById('f-name').value.trim();
        const servingGrams = num('f-grams'), cal = num('f-cal'), protein = num('f-pro');
        const err = document.getElementById('f-err');
        if (!name) { err.textContent = 'Enter a name.'; break; }
        if (!(servingGrams > 0)) { err.textContent = 'Serving size must be more than 0 g.'; break; }
        if (!(cal >= 0)) { err.textContent = 'Enter calories per serving.'; break; }
        if (!(protein >= 0)) { err.textContent = 'Enter protein per serving (0 is fine).'; break; }
        const food = F.saveFood({ id: p.foodId, name, servingGrams, cal, protein });
        if (p.thenLog) { ui.stack.pop(); openLogNew(food, p.toDraft); } else { pop(); toast(p.foodId ? 'Food saved' : 'Food created'); }
        break;
      }
      case 'delete-food':
        if (confirm('Delete this saved food? Entries you already logged stay as they are.')) { F.deleteFood(p.foodId); pop(); toast('Food deleted'); }
        break;

      case 'save-goals': {
        const calGoal = num('g-cal'), calRange = num('g-range'), proteinGoal = num('g-pro'), proteinMin = num('g-min'), waterGoal = num('g-water');
        const err = document.getElementById('g-err');
        if (!(calGoal > 0)) { err.textContent = 'Enter a calorie goal above 0.'; break; }
        if (!(calRange >= 0 && calRange <= 50)) { err.textContent = 'Hit range must be 0–50 %.'; break; }
        if (!(proteinGoal > 0)) { err.textContent = 'Enter a protein goal above 0.'; break; }
        if (!(proteinMin > 0)) { err.textContent = 'Enter a protein minimum above 0.'; break; }
        if (!(waterGoal > 0 && waterGoal <= 400)) { err.textContent = 'Enter a water goal from 1 to 400 oz.'; break; }
        // New goals apply from today's food day on; past days keep their result.
        const after = changed(today(), () => F.saveGoals({ calGoal: Math.round(calGoal), calRange, proteinGoal: Math.round(proteinGoal), proteinMin: Math.round(proteinMin), waterGoal: Math.round(waterGoal) }));
        rerender();
        toast('Goals saved');
        after();
        break;
      }

      case 'import-file': {
        const input = document.getElementById('food-import');
        input.value = '';
        input.click();
        break;
      }
      case 'import-direct': {
        const r = Imp.readOldAppStorage();
        if (!r.ok) { document.getElementById('import-err').textContent = r.error; break; }
        push({ view: 'import-confirm', data: r.data, summary: r.summary });
        break;
      }
      case 'import-confirm': {
        const after = changed(today(), () => F.importFromCalorieTracker(p.data));
        ui.sub = 'today';
        selectDate(today());
        popAll();
        toast('Copied from Calorie Tracker');
        after();
        break;
      }

      case 'new-meal': push({ view: 'meal-form', draft: { name: '', category: L.mealForTime(now()), items: [] } }); break;
      case 'save-as-meal': push({ view: 'meal-form', draft: { name: '', category: ui.mealTab, items: F.entriesFor(ui.date).filter((e) => e.meal === ui.mealTab).map(itemFromEntry) } }); break;
      case 'edit-meal': push({ view: 'meal-form', draft: structuredClone(F.getMeal(el.dataset.id)) }); break;
      case 'pick-cat': p.draft.category = el.dataset.meal; rerender(); break;
      case 'draft-add-food': push({ view: 'pick', toDraft: true }); break;
      case 'draft-add-quick': push({ view: 'quick', toDraft: true }); break;
      case 'edit-item': openEditItem(Number(el.dataset.i)); break;
      case 'remove-item': p.draft.items.splice(Number(el.dataset.i), 1); rerender(); break;
      case 'save-meal': {
        const d = p.draft;
        const err = document.getElementById('m-err');
        if (!d.name.trim()) { err.textContent = 'Give the meal a name.'; break; }
        if (!d.items.length) { err.textContent = 'Add at least one item.'; break; }
        F.saveMeal(d);
        ui.sub = 'meals';
        popAll();
        toast(d.id ? 'Meal saved' : `Saved "${d.name.trim()}"`);
        break;
      }
      case 'delete-meal':
        if (confirm('Delete this saved meal? Anything already logged stays.')) { F.deleteMeal(p.draft.id); popAll(); toast('Meal deleted'); }
        break;
      case 'add-meal': {
        const m = F.getMeal(el.dataset.id);
        const meal = L.mealForTime(now());
        finish(meal, addedMsg(`Added ${m.name} to`, meal), changed(ui.date, () => F.addEntries(F.mealItemsForAdding(m), { date: ui.date, meal })));
        break;
      }
      case 'repeat-meal': {
        const { date, meal: from } = el.dataset;
        const meal = L.mealForTime(now());
        const items = F.entriesFor(date).filter((e) => e.meal === from).map(itemFromEntry);
        finish(meal, addedMsg(`Copied ${shortDate(date)} ${L.MEAL_LABELS[from]} to`, meal), changed(ui.date, () => F.addEntries(items, { date: ui.date, meal })));
        break;
      }
    }
  });

  root.addEventListener('input', (ev) => {
    if (!mine()) return;
    const p = page();
    if (ev.target.id === 'pick-search') fillPickList(p);
    if (ev.target.id === 'foods-search') { ui.foodsQuery = ev.target.value; fillFoodsList(); }
    if (ev.target.id === 'm-name') p.draft.name = ev.target.value;
  });

  root.addEventListener('change', async (ev) => {
    if (!mine() || ev.target.id !== 'food-import' || !ev.target.files[0]) return;
    const r = await Imp.readBackupFile(ev.target.files[0]);
    if (!r.ok) { document.getElementById('import-err').textContent = r.error; return; }
    push({ view: 'import-confirm', data: r.data, summary: r.summary });
  });

  // Week strip: swipe left/right
  root.addEventListener('pointerdown', (ev) => {
    if (!mine()) return;
    suppressClick = false;
    swipe = ev.target.closest('[data-swipe="week"]') ? { x: ev.clientX, y: ev.clientY } : null;
  });
  root.addEventListener('pointerup', (ev) => {
    if (!swipe) return;
    const dx = ev.clientX - swipe.x, dy = ev.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      suppressClick = true;
      changeWeek(dx < 0 ? 1 : -1);
    }
  });
  root.addEventListener('pointercancel', () => { swipe = null; });
}

function openWaterSheet() {
  const date = ui.date;
  sheet.open({
    title: 'Add water',
    body: `<label class="imp-field"><span class="imp-label">Ounces (negative to remove)</span><span class="food-unit"><input class="imp-input" id="w-oz" type="number" inputmode="decimal" placeholder="e.g. 20"><span>oz</span></span></label>
      <p class="food-note">Common sizes: cup 8 · bottle 16.9 · big bottle 24–32 · 1 L ≈ 33.8</p>
      <button class="imp-btn imp-btn--primary imp-btn--block" id="w-save">Add</button>`,
    onMount(b) {
      setTimeout(() => b.querySelector('#w-oz')?.focus(), 50);
      b.onclick = (ev) => {
        if (!ev.target.closest('#w-save')) return;
        const oz = Number(b.querySelector('#w-oz').value);
        if (!oz || !Number.isFinite(oz) || Math.abs(oz) > 400) return toast('Enter an amount in oz');
        sheet.close();
        const after = changed(date, () => F.addWater(date, oz));
        rerender();
        toast(`${oz > 0 ? '+' : ''}${fmtOz(oz)} oz water`);
        after();
      };
    },
  });
}

function changeWeek(dir) {
  selectDate(L.addDays(ui.date, 7 * dir));
  ui.slide = dir > 0 ? 'from-right' : 'from-left';
  rerender();
}

// Re-check today's food day (e.g. on app open or a new day).
export function recheckToday() {
  return Auto.recheck(today());
}

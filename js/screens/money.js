// Money tab: spending log, per-category monthly budgets, paydays + saving, monthly review.
import * as L from '../money/logic.js';
import * as M from '../money/store.js';
import { recheckMoney } from '../money/autocheck.js';
import * as Stats from '../stats.js';
import { celebrate } from './today.js';
import { dayKey, fromDayKey, periodRange } from '../dates.js';
import { esc, icon, xpbar, toast, sheet, PICKER_ICONS } from '../ui.js';
import { monthlyOpen } from '../launch.js';

const SUBS = [['overview', 'Overview'], ['history', 'History'], ['budget', 'Budget'], ['settings', 'Settings']];
const KIND = { expense: 'Expense', income: 'Paycheck', saving: 'Saving' };
const MONEY_ICONS = ['diet', 'gas', 'car', 'game', 'bag', 'cart', 'keys', 'pill', 'cash', 'bank', 'piggy', 'ticket', 'coffee', 'home', 'heart', 'style', 'people', 'book', 'music', 'star'];

const ui = { sub: 'overview', month: dayKey().slice(0, 7) };
let ctx;
const rerender = () => ctx.refresh();
const today = () => dayKey();
const shortDate = (k) => fromDayKey(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// Any data change: re-check the Money habits, then show XP / level moments.
// `dates` are the entry dates touched, so a saving back-dated into an earlier week counts for that week.
function changed(fn, dates = []) {
  const before = Stats.compute();
  fn();
  const weekStart = periodRange('weekly')[0];
  let added = [];
  for (const k of new Set(dates)) {
    if (!k || k >= weekStart) continue;
    const d = fromDayKey(k);
    d.setHours(12);
    added = added.concat(recheckMoney(d));
  }
  added = added.concat(recheckMoney());
  rerender();
  celebrate(before, Stats.compute(), added);
}

const box = (title, body, meta = '') =>
  `<section class="imp-panel"><header class="imp-panel__head"><h2 class="imp-panel__title">${title}</h2><span class="imp-panel__meta">${meta}</span></header><div class="imp-panel__body">${body}</div></section>`;

export function render(root, refresh) {
  ctx = { root, refresh };
  const s = M.getState();
  const subnav = `<div class="imp-seg food-subnav">${SUBS.map(([id, label]) => `<button data-m="sub" data-sub="${id}" class="${ui.sub === id ? 'is-on' : ''}">${label}</button>`).join('')}</div>`;
  const body = { overview, history, budget, settings }[ui.sub](s);
  root.innerHTML = `<div class="screen money">${subnav}${body}</div>`;
  // Settings: put back anything typed before switching pay schedule or saving mode
  if (ui.sub === 'settings' && ui.typed) {
    for (const [id, v] of Object.entries(ui.typed)) { const el = root.querySelector('#' + id); if (el) el.value = v; }
  }
}
function keepTyped() {
  ui.typed = { ...(ui.typed || {}) };
  for (const el of ctx.root.querySelectorAll('.money input[id]')) ui.typed[el.id] = el.value;
}

const money = (s, c) => L.fmtMoney(c, s.settings.currency);
const monthNav = () => `<div class="mon-nav"><button class="imp-btn imp-btn--sm imp-btn--secondary" data-m="month" data-dir="-1" aria-label="Previous month">◂</button>
  <span class="imp-title">${esc(L.monthLabel(ui.month))}</span>
  <button class="imp-btn imp-btn--sm imp-btn--secondary" data-m="month" data-dir="1" aria-label="Next month" ${ui.month >= today().slice(0, 7) ? 'disabled' : ''}>▸</button></div>`;

function catRow(s, c, spent) {
  const has = c.budget > 0;
  const over = has && spent > c.budget;
  const p = has ? Math.min(100, Math.round((spent / c.budget) * 100)) : 0;
  return `<div class="mon-cat${over ? ' is-over' : ''}">${icon(c.icon, 'mon-cat__icon')}
    <div class="mon-cat__top"><span class="mon-cat__name">${esc(c.name)}</span>
      <span class="mon-cat__val">${money(s, spent)}${has ? ` <small>/ ${money(s, c.budget)}</small>` : ''}</span></div>
    ${has ? xpbar(p, `imp-xpbar--sm${over ? ' imp-xpbar--over' : ''}`) : '<p class="mon-nobudget">No budget set</p>'}
  </div>`;
}

function overview(s) {
  const sum = L.monthSummary(s, ui.month);
  const current = ui.month === today().slice(0, 7);
  const left = sum.budget - sum.spent;
  const over = sum.budget > 0 && left < 0;
  const head = `${monthNav()}
    <div class="mon-hero${over ? ' is-over' : ''}">
      <div class="mon-big">${money(s, sum.spent)}</div>
      <div class="mon-cap">spent${sum.budget ? ` of ${money(s, sum.budget)} budget` : ''}</div>
      ${sum.budget ? `${xpbar(Math.min(100, Math.round((sum.spent / sum.budget) * 100)), over ? 'imp-xpbar--over' : '')}
        <p class="mon-left">${over ? `${money(s, -left)} over budget` : `${money(s, left)} left`}</p>` : ''}
      <div class="mon-mini"><span>Paychecks <b class="mon-in">${money(s, sum.income)}</b></span><span>Saved <b class="imp-accent">${money(s, sum.saved)}</b></span></div>
    </div>
    ${current ? `<div class="imp-btn-row mon-add">
      <button class="imp-btn imp-btn--primary" data-m="add" data-kind="expense">${icon('plus')}Expense</button>
      <button class="imp-btn imp-btn--secondary" data-m="add" data-kind="income">Paycheck</button>
      <button class="imp-btn imp-btn--secondary" data-m="add" data-kind="saving">Saving</button></div>` : ''}`;

  const cats = s.categories.map((c) => catRow(s, c, sum.byCat[c.id] || 0)).join('');
  const orphan = Object.keys(sum.byCat).filter((id) => !s.categories.some((c) => c.id === id)).reduce((t, id) => t + sum.byCat[id], 0);

  return `${box('Spending', head, icon('wallet'))}
    ${current ? paydayPanel(s) : ''}
    ${box('By category', cats + (orphan ? catRow(s, { name: 'Deleted categories', icon: 'scroll', budget: 0 }, orphan) : ''), `<button class="imp-btn imp-btn--sm imp-btn--ghost" data-m="sub" data-sub="budget">Edit</button>`)}
    ${current ? reviewPanel(s) : ''}`;
}

function paydayPanel(s) {
  if (!s.settings.setup) {
    return box('Paydays', `<div class="mon-stack"><p class="mon-note">Set your pay schedule and how much to save, and your paycheck-saving habit will tick itself on the Today tab.</p>
      <button class="imp-btn imp-btn--primary imp-btn--block" data-m="sub" data-sub="settings">Set up paydays</button></div>`, icon('piggy'));
  }
  const st = L.saveStatus(s);
  const next = L.nextPayday(s.settings.pay, today());
  const target = s.settings.save.mode === 'percent' ? `${s.settings.save.percent}% of each paycheck` : `${money(s, s.settings.save.amount)} per paycheck`;
  let status;
  if (st.offWeek) status = `<p class="mon-status">No payday this week: a week off for your saving habit (no XP, streak safe).</p>`;
  else if (st.pending) status = `<p class="mon-status">Payday ${st.expected.map(shortDate).join(', ')}: log the paycheck to see what to save.</p>`;
  else status = `<p class="mon-status${st.hit ? ' is-on' : ''}">${st.hit ? icon('check') : ''} This week: saved ${money(s, st.saved)} of ${money(s, st.required)}</p>`;
  // One-tap saving for what's still owed this week (or the usual amount in an off week)
  const quick = st.hit && !st.offWeek ? 0 : !st.offWeek && !st.pending ? Math.max(0, st.required - st.saved) : s.settings.save.mode === 'amount' ? s.settings.save.amount : 0;
  return box('Paydays', `<div class="mon-stack">
      <div class="mon-pay"><span class="imp-label">Next payday</span><b>${next === today() ? 'Today' : next ? shortDate(next) : '—'}</b></div>
      <div class="mon-pay"><span class="imp-label">Save</span><b>${target}</b></div>
      ${status}
      <div class="imp-btn-row">
        <button class="imp-btn imp-btn--secondary imp-btn--sm" data-m="add" data-kind="income">Log paycheck</button>
        ${quick ? `<button class="imp-btn imp-btn--primary imp-btn--sm" data-m="quick-save" data-amount="${quick}">${icon('piggy')}Save ${money(s, quick)}</button>` : ''}
      </div></div>`, icon('piggy'));
}

function reviewPanel(s) {
  if (!monthlyOpen()) {
    return box('Monthly review', `<p class="mon-note">Your first review is for the first full habit month (Mon Nov 2 – Sun Dec 6). It opens Nov 2.</p>`, icon('scroll'));
  }
  const mk = L.reviewMonth();
  const done = s.reviews?.[mk];
  return box(`${L.monthLabel(mk).split(' ')[0]} review`, `<div class="mon-stack">
    ${done ? `<p class="mon-status is-on">${icon('check')} Done ${new Date(done.doneAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>`
      : '<p class="mon-note">A quick look at this month: spending vs. budget, biggest categories, paychecks and savings.</p>'}
    <button class="imp-btn ${done ? 'imp-btn--secondary' : 'imp-btn--primary'} imp-btn--block" data-m="review">${done ? 'Open review' : 'Start review'}</button></div>`, icon('scroll'));
}

function history(s) {
  const [start, end] = L.monthRange(ui.month);
  const list = L.inRange(s.entries, start, end).sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
  const cat = (id) => s.categories.find((c) => c.id === id);
  const days = [...new Set(list.map((e) => e.date))];
  const rows = days.map((d) => `<div class="imp-panel__sub">${shortDate(d)}</div>` + list.filter((e) => e.date === d).map((e) => {
    const c = e.kind === 'expense' ? cat(e.cat) : null;
    const ic = e.kind === 'income' ? 'bank' : e.kind === 'saving' ? 'piggy' : c?.icon || 'cash';
    const title = e.note || (e.kind === 'expense' ? c?.name || 'Expense' : KIND[e.kind]);
    const sub = e.kind === 'expense' ? (e.note ? c?.name || 'Other' : 'Expense') : KIND[e.kind];
    return `<button class="mon-row" data-m="edit" data-id="${e.id}">${icon(ic, `mon-row__icon mon-k-${e.kind}`)}
      <span class="mon-row__mid"><span class="mon-row__name">${esc(title)}</span><span class="mon-row__sub">${esc(sub)}</span></span>
      <span class="mon-row__amt mon-k-${e.kind}">${e.kind === 'expense' ? '' : '+'}${money(s, e.amount)}</span></button>`;
  }).join('')).join('');
  return box('History', `${monthNav()}<div class="mon-stack">
    ${ui.month === today().slice(0, 7) ? `<button class="imp-btn imp-btn--primary imp-btn--block" data-m="add" data-kind="expense">${icon('plus')}Expense</button>` : ''}
    <div>${rows || '<p class="mon-note">Nothing logged this month.</p>'}</div></div>`);
}

function budget(s) {
  const rows = s.categories.map((c, i) => `
    <div class="mon-bud">
      <button class="cat-icon" data-m="pick-icon" data-i="${i}" aria-label="Change icon">${icon(c.icon)}</button>
      <input class="imp-input" data-name="${i}" maxlength="30" value="${esc(c.name)}" aria-label="Category name">
      <span class="food-unit mon-bud__amt"><input class="imp-input" data-budget="${i}" inputmode="decimal" placeholder="0" value="${c.budget ? c.budget / 100 : ''}" aria-label="Monthly budget"><span>/mo</span></span>
      <button class="imp-btn imp-btn--sm imp-btn--ghost mon-del" data-m="del-cat" data-i="${i}" aria-label="Delete category">${icon('trash')}</button>
    </div>
    ${ui.picking === i ? `<div class="imp-icon-grid">${MONEY_ICONS.concat(PICKER_ICONS.filter((k) => !MONEY_ICONS.includes(k))).map((k) => `<button data-m="set-icon" data-i="${i}" data-icon="${k}" class="${k === c.icon ? 'is-on' : ''}">${icon(k)}</button>`).join('')}</div>` : ''}`).join('');
  const total = s.categories.reduce((t, c) => t + (c.budget || 0), 0);
  return box('Monthly budgets', `<div class="mon-stack">
    <p class="mon-note">Set a monthly limit per category. Leave blank for no limit. Total: <span class="imp-accent">${money(s, total)}</span></p>
    ${rows}
    <button class="imp-btn imp-btn--secondary imp-btn--block" data-m="add-cat">${icon('plus')}Add category</button>
    <button class="imp-btn imp-btn--primary imp-btn--block" data-m="save-budget">Save budgets</button></div>`);
}

function settings(s) {
  const p = s.settings.pay;
  const sv = s.settings.save;
  const f = ui.payFreq || p.freq;
  const mode = ui.saveMode || sv.mode;
  const fields = {
    weekly: `<label class="imp-field"><span class="imp-label">A recent payday</span><input class="imp-input" type="date" id="p-anchor" value="${p.anchor || ''}"></label>`,
    biweekly: `<label class="imp-field"><span class="imp-label">A recent payday</span><input class="imp-input" type="date" id="p-anchor" value="${p.anchor || ''}"></label>`,
    semimonthly: `<div class="imp-field-row"><label class="imp-field"><span class="imp-label">First day</span><input class="imp-input" id="p-d1" inputmode="numeric" value="${p.days?.[0] ?? 1}"></label>
      <label class="imp-field"><span class="imp-label">Second day</span><input class="imp-input" id="p-d2" inputmode="numeric" value="${p.days?.[1] ?? 15}"></label></div>`,
    monthly: `<label class="imp-field"><span class="imp-label">Day of the month</span><input class="imp-input" id="p-day" inputmode="numeric" value="${p.day ?? 1}"></label>`,
    irregular: '<p class="mon-note">Log each paycheck when it comes. The saving habit only asks for a saving in weeks you log one.</p>',
  }[f];
  return `${box('Pay schedule', `<div class="mon-stack">
      <div class="imp-seg mon-seg">${Object.entries(L.FREQS).map(([k, v]) => `<button data-m="freq" data-freq="${k}" class="${f === k ? 'is-on' : ''}">${v}</button>`).join('')}</div>
      ${fields}</div>`, icon('bank'))}
    ${box('Saving', `<div class="mon-stack">
      <div class="imp-seg"><button data-m="mode" data-mode="amount" class="${mode === 'amount' ? 'is-on' : ''}">Fixed amount</button>
        <button data-m="mode" data-mode="percent" class="${mode === 'percent' ? 'is-on' : ''}">% of paycheck</button></div>
      ${mode === 'amount'
        ? `<label class="imp-field"><span class="imp-label">Save per paycheck</span><span class="food-unit"><input class="imp-input" id="s-amount" inputmode="decimal" value="${sv.amount / 100}"><span>${esc(s.settings.currency)}</span></span></label>`
        : `<label class="imp-field"><span class="imp-label">Save of each paycheck</span><span class="food-unit"><input class="imp-input" id="s-percent" inputmode="decimal" value="${sv.percent}"><span>%</span></span></label>`}
      <p class="mon-note">Your paycheck-saving habit on the Today tab ticks when you've logged that much saving in a payday week. Weeks without a payday tick on their own.</p></div>`, icon('piggy'))}
    ${box('Other', `<div class="mon-stack">
      <label class="imp-field"><span class="imp-label">Currency symbol</span><input class="imp-input" id="s-cur" maxlength="3" value="${esc(s.settings.currency)}"></label>
      <p class="food-err" id="s-err"></p>
      <button class="imp-btn imp-btn--primary imp-btn--block" data-m="save-settings">Save settings</button>
      <p class="mon-note">Money data is included in Improve's backup on the Profile tab.</p></div>`)}`;
}

// ---------- Sheets ----------
function openEntry(kind, e = null) {
  const s = M.getState();
  const cur = e || { kind, amount: kind === 'saving' && s.settings.save.mode === 'amount' ? s.settings.save.amount : 0, cat: s.categories[0]?.id, note: '', date: today() };
  let k = cur.kind;
  let cat = cur.cat || s.categories[0]?.id;
  const body = () => `
    <div class="imp-seg">${Object.entries(KIND).map(([id, v]) => `<button type="button" data-k="${id}" class="${k === id ? 'is-on' : ''}">${v}</button>`).join('')}</div>
    <label class="imp-field"><span class="imp-label">Amount</span><span class="food-unit"><input class="imp-input mon-amt" id="e-amt" inputmode="decimal" placeholder="0.00" value="${cur.amount ? cur.amount / 100 : ''}" autocomplete="off"><span>${esc(s.settings.currency)}</span></span></label>
    ${k === 'expense' ? `<div class="imp-field"><span class="imp-label">Category</span><div class="mon-chips">${s.categories.map((c) => `<button type="button" data-cat="${c.id}" class="mon-chip${cat === c.id ? ' is-on' : ''}">${icon(c.icon)}${esc(c.name)}</button>`).join('')}</div></div>` : ''}
    <label class="imp-field"><span class="imp-label">Note (optional)</span><input class="imp-input" id="e-note" maxlength="60" value="${esc(cur.note || '')}" placeholder="${k === 'expense' ? 'e.g. Chipotle' : k === 'income' ? 'e.g. Job' : 'e.g. Savings account'}" autocomplete="off"></label>
    <label class="imp-field"><span class="imp-label">Date</span><input class="imp-input" type="date" id="e-date" value="${cur.date}" max="${today()}"></label>
    <p class="food-err" id="e-err"></p>
    <button class="imp-btn imp-btn--primary imp-btn--block" id="e-save">${e ? 'Save' : `Add ${KIND[k].toLowerCase()}`}</button>
    ${e ? `<button class="imp-btn imp-btn--danger imp-btn--block" id="e-del">${icon('trash')}Delete</button>` : ''}`;
  sheet.open({
    title: e ? `Edit ${KIND[cur.kind].toLowerCase()}` : `New ${KIND[k].toLowerCase()}`,
    body: body(),
    onMount(b) {
      const keep = () => { cur.amount = L.toCents(b.querySelector('#e-amt').value) || 0; cur.note = b.querySelector('#e-note').value; cur.date = b.querySelector('#e-date').value || today(); };
      const redraw = () => { keep(); b.innerHTML = body(); };
      b.onclick = (ev) => {
        const t = ev.target.closest('button');
        if (!t) return;
        if (t.dataset.k) { k = t.dataset.k; return redraw(); }
        if (t.dataset.cat) { cat = t.dataset.cat; b.querySelectorAll('.mon-chip').forEach((x) => x.classList.toggle('is-on', x === t)); return; }
        if (t.id === 'e-save') {
          const amount = L.toCents(b.querySelector('#e-amt').value);
          if (!(amount > 0)) { b.querySelector('#e-err').textContent = 'Enter an amount above 0.'; return; }
          const date = b.querySelector('#e-date').value || today();
          const entry = { ...(e || {}), kind: k, amount, note: b.querySelector('#e-note').value.trim(), date, cat: k === 'expense' ? cat : undefined };
          sheet.close();
          changed(() => M.upsertEntry(entry), [entry.date, e?.date]);
          toast(e ? 'Saved' : `${KIND[k]} added`);
        }
        if (t.id === 'e-del' && confirm('Delete this entry?')) {
          sheet.close();
          changed(() => M.deleteEntry(e.id), [e.date]);
          toast('Deleted');
        }
      };
      if (!e) setTimeout(() => b.querySelector('#e-amt')?.focus(), 50);
    },
  });
}

function openReview() {
  const s = M.getState();
  const mk = L.reviewMonth();
  const sum = L.monthSummary(s, mk);
  const prev = L.monthSummary(s, L.shiftMonth(mk, -1));
  const done = s.reviews?.[mk];
  const cats = s.categories.map((c) => ({ c, spent: sum.byCat[c.id] || 0 })).sort((a, b) => b.spent - a.spent);
  const overs = cats.filter((x) => x.c.budget > 0 && x.spent > x.c.budget);
  const top = cats.filter((x) => x.spent > 0).slice(0, 3);
  const line = (label, val, cls = '') => `<div class="mon-pay"><span class="imp-label">${label}</span><b class="${cls}">${val}</b></div>`;
  const diff = sum.spent - prev.spent;
  sheet.open({
    title: `${L.monthLabel(mk)} review`,
    body: `
      ${line('Spent', money(s, sum.spent))}
      ${sum.budget ? line('Budget', `${money(s, sum.budget)} · ${sum.spent > sum.budget ? `${money(s, sum.spent - sum.budget)} over` : `${money(s, sum.budget - sum.spent)} left`}`, sum.spent > sum.budget ? 'mon-over' : 'imp-accent') : ''}
      ${line('Vs. last month', prev.spent ? `${diff > 0 ? '+' : ''}${money(s, diff)}` : '—', diff > 0 ? 'mon-over' : 'imp-accent')}
      ${line('Paychecks', money(s, sum.income), 'mon-in')}
      ${line('Saved', money(s, sum.saved), 'imp-accent')}
      <div class="imp-panel__sub">Biggest categories</div>
      ${top.length ? top.map((x) => line(esc(x.c.name), money(s, x.spent))).join('') : '<p class="mon-note">No spending logged yet.</p>'}
      <div class="imp-panel__sub">Over budget</div>
      ${overs.length ? overs.map((x) => line(esc(x.c.name), `${money(s, x.spent - x.c.budget)} over`, 'mon-over')).join('') : '<p class="mon-note">Nothing over budget.</p>'}
      <button class="imp-btn imp-btn--secondary imp-btn--block" id="r-budget">Adjust budgets</button>
      ${done ? '<button class="imp-btn imp-btn--ghost imp-btn--block" id="r-undo">Mark not done</button>' : '<button class="imp-btn imp-btn--primary imp-btn--block" id="r-done">Finish review</button>'}`,
    onMount(b) {
      b.onclick = (ev) => {
        const t = ev.target.closest('button');
        if (!t) return;
        if (t.id === 'r-budget') { sheet.close(); ui.sub = 'budget'; rerender(); }
        if (t.id === 'r-done') { sheet.close(); changed(() => M.setReview(mk, true)); toast('Review done'); }
        if (t.id === 'r-undo') { sheet.close(); changed(() => M.setReview(mk, false)); }
      };
    },
  });
}

// ---------- Events ----------
export function bind(root) {
  const mine = () => root.dataset.tab === 'money';

  root.addEventListener('input', (ev) => {
    if (!mine() || ui.sub !== 'budget') return;
    const t = ev.target;
    const d = draft(M.getState());
    if (t.dataset.name != null) d[+t.dataset.name].name = t.value;
    if (t.dataset.budget != null) d[+t.dataset.budget].budget = t.value.trim() ? L.toCents(t.value) : 0;
  });

  root.addEventListener('click', (ev) => {
    if (!mine()) return;
    const el = ev.target.closest('[data-m]');
    if (!el) return;
    const s = M.getState();
    switch (el.dataset.m) {
      case 'sub': ui.sub = el.dataset.sub; ui.draft = null; ui.picking = null; ui.payFreq = null; ui.saveMode = null; ui.typed = null; rerender(); break;
      case 'month': ui.month = L.shiftMonth(ui.month, Number(el.dataset.dir)); rerender(); break;
      case 'add': openEntry(el.dataset.kind); break;
      case 'edit': openEntry(null, s.entries.find((e) => e.id === el.dataset.id)); break;
      case 'quick-save': {
        const amount = Number(el.dataset.amount);
        changed(() => M.upsertEntry({ kind: 'saving', amount, note: '', date: today() }));
        toast(`Saved ${money(s, amount)}`);
        break;
      }
      case 'review': openReview(); break;

      // Budget editing works on a draft until Save
      case 'pick-icon': draft(s); ui.picking = ui.picking === +el.dataset.i ? null : +el.dataset.i; renderDraft(); break;
      case 'set-icon': draft(s)[+el.dataset.i].icon = el.dataset.icon; ui.picking = null; renderDraft(); break;
      case 'add-cat': draft(s).push({ id: M.newCategoryId(), name: 'New category', icon: 'cash', budget: 0 }); renderDraft(); break;
      case 'del-cat': {
        const d = draft(s);
        const c = d[+el.dataset.i];
        if (s.entries.some((e) => e.cat === c.id) && !confirm(`"${c.name}" has logged expenses. Delete it anyway? They'll show under "Deleted categories".`)) break;
        d.splice(+el.dataset.i, 1);
        ui.picking = null;
        renderDraft();
        break;
      }
      case 'save-budget': {
        const d = draft(s);
        if (d.some((c) => Number.isNaN(c.budget) || c.budget < 0)) { toast('Check the budget amounts'); break; }
        M.saveCategories(d.map((c) => ({ ...c, name: c.name.trim() || 'Untitled' })));
        ui.draft = null;
        rerender();
        toast('Budgets saved');
        break;
      }

      case 'freq': keepTyped(); ui.payFreq = el.dataset.freq; rerender(); break;
      case 'mode': keepTyped(); ui.saveMode = el.dataset.mode; rerender(); break;
      case 'save-settings': saveSettings(s); break;
    }
  });
}

function draft(s) {
  ui.draft ||= structuredClone(s.categories);
  return ui.draft;
}
// Re-render the budget page from the draft, keeping typed values.
function renderDraft() {
  const real = M.getState();
  const s = { ...real, categories: ui.draft };
  ctx.root.innerHTML = `<div class="screen money"><div class="imp-seg food-subnav">${SUBS.map(([id, label]) => `<button data-m="sub" data-sub="${id}" class="${ui.sub === id ? 'is-on' : ''}">${label}</button>`).join('')}</div>${budget(s)}</div>`;
}

function saveSettings(s) {
  const err = ctx.root.querySelector('#s-err');
  const freq = ui.payFreq || s.settings.pay.freq;
  const mode = ui.saveMode || s.settings.save.mode;
  const pay = { ...s.settings.pay, freq };
  const num = (id) => Number(ctx.root.querySelector(id)?.value);
  if (freq === 'weekly' || freq === 'biweekly') {
    pay.anchor = ctx.root.querySelector('#p-anchor').value || null;
    if (!pay.anchor) { err.textContent = 'Pick a recent payday.'; return; }
  }
  if (freq === 'semimonthly') {
    pay.days = [num('#p-d1'), num('#p-d2')];
    if (pay.days.some((d) => !(d >= 1 && d <= 31 && Number.isInteger(d)))) { err.textContent = 'Days must be 1–31.'; return; }
  }
  if (freq === 'monthly') {
    pay.day = num('#p-day');
    if (!(pay.day >= 1 && pay.day <= 31 && Number.isInteger(pay.day))) { err.textContent = 'Day must be 1–31.'; return; }
  }
  const save = { ...s.settings.save, mode };
  if (mode === 'amount') {
    save.amount = L.toCents(ctx.root.querySelector('#s-amount').value);
    if (!(save.amount > 0)) { err.textContent = 'Enter an amount to save per paycheck.'; return; }
  } else {
    save.percent = Number(ctx.root.querySelector('#s-percent').value);
    if (!(save.percent > 0 && save.percent <= 100)) { err.textContent = 'Percent must be 1–100.'; return; }
  }
  const currency = ctx.root.querySelector('#s-cur').value.trim() || '$';
  ui.payFreq = null;
  ui.saveMode = null;
  ui.typed = null;
  changed(() => M.saveSettings({ pay, save, currency, setup: true }));
  toast('Settings saved');
}

export const recheck = () => recheckMoney();

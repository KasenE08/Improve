// Money: one page (month summary, accounts, budget, history). Budgets and paychecks open from ⋯ in the top bar.
import * as L from '../money/logic.js';
import * as M from '../money/store.js';
import { recheckMoney } from '../money/autocheck.js';
import * as Stats from '../stats.js';
import { celebrate } from './today.js';
import { dayKey, fromDayKey, periodRange } from '../dates.js';
import { esc, icon, xpbar, toast, sheet, PICKER_ICONS } from '../ui.js';

const KIND = { expense: 'Expense', income: 'Paycheck', saving: 'To savings', transfer: 'Move' };
const MONEY_ICONS = ['diet', 'gas', 'car', 'game', 'bag', 'cart', 'keys', 'pill', 'cash', 'bank', 'piggy', 'ticket', 'coffee', 'home', 'heart', 'style', 'people', 'book', 'music', 'star'];

// page: null = the main page, 'budget' or 'settings' = a page pushed from the ⋯ menu
const ui = { page: null, month: dayKey().slice(0, 7) };
let ctx;
const rerender = () => ctx.refresh();
const today = () => dayKey();
const shortDate = (k) => fromDayKey(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();

// Any data change: re-check the Money habits, then show habit moments.
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
const nav = (title) => `<div class="food-nav mon-pagenav"><button class="food-back" data-m="back" aria-label="Back">${icon('prev')}</button><h2>${esc(title)}</h2><span></span></div>`;

export function render(root, refresh) {
  ctx = { root, refresh };
  const s = M.getState();
  const body = ui.page === 'budget' ? nav('Budgets') + budget(s) : ui.page === 'settings' ? nav('Paychecks') + settings(s) : main(s);
  root.innerHTML = `<div class="screen money">${body}</div>`;
  // Settings: put back anything typed before switching pay schedule or saving mode
  if (ui.page === 'settings' && ui.typed) {
    for (const [id, v] of Object.entries(ui.typed)) { const el = root.querySelector('#' + id); if (el) el.value = v; }
  }
}
function keepTyped() {
  ui.typed = { ...(ui.typed || {}) };
  for (const el of ctx.root.querySelectorAll('.money input[id]')) ui.typed[el.id] = el.value;
}
/** Leaving Money: start on the main page next time. */
export const reset = () => { ui.page = null; ui.month = today().slice(0, 7); };

function openPage(page) {
  ui.page = page; ui.draft = null; ui.picking = null; ui.payFreq = null; ui.split = null; ui.typed = null;
  rerender();
  window.scrollTo(0, 0);
}

/** ⋯ in the top bar: budgets and paychecks (they used to be tabs). */
export function openMenu() {
  const s = M.getState();
  const total = s.categories.reduce((t, c) => t + (c.budget || 0), 0);
  const row = (page, ic, title, sub) => `<button class="g-row food-menu-row" data-page="${page}"><span class="g-icon">${icon(ic)}</span><span class="g-main"><span class="g-title">${title}</span><span class="g-sub">${esc(sub)}</span></span>${icon('next')}</button>`;
  sheet.open({
    title: 'Money',
    body: `<div class="group">
      ${row('budget', 'wallet', 'Budgets', total ? `${money(s, total)} a month · ${s.categories.length} categories` : `${s.categories.length} categories · no budgets yet`)}
      ${row('settings', 'piggy', 'Paychecks', s.settings.setup ? `${L.FREQS[s.settings.pay.freq]} · ${splitText(s, s.settings.split)}` : 'Pay schedule and paycheck split')}
    </div>`,
    onMount(b) {
      b.onclick = (e) => {
        const p = e.target.closest('[data-page]')?.dataset.page;
        if (!p) return;
        sheet.close();
        openPage(p);
      };
    },
  });
}

const money = (s, c) => L.fmtMoney(c, s.settings.currency);
const monthNav = () => `<div class="mon-nav"><button class="food-back" data-m="month" data-dir="-1" aria-label="Previous month">${icon('prev')}</button>
  <span class="mon-nav__title">${esc(L.monthLabel(ui.month))}</span>
  <button class="food-back" data-m="month" data-dir="1" aria-label="Next month" ${ui.month >= today().slice(0, 7) ? 'disabled' : ''}>${icon('next')}</button></div>`;

function catRow(s, c, spent) {
  const has = c.budget > 0;
  const over = has && spent > c.budget;
  const p = has ? Math.min(100, Math.round((spent / c.budget) * 100)) : 0;
  return `<div class="mon-cat${over ? ' is-over' : ''}">${icon(c.icon, 'mon-cat__icon')}
    <div class="mon-cat__top"><span class="mon-cat__name">${esc(c.name)}</span>
      <span class="mon-cat__val">${money(s, spent)}${has ? ` <small>/ ${money(s, c.budget)}</small>` : ''}</span></div>
    ${has ? xpbar(p, `imp-xpbar--sm mon-bar${over ? ' imp-xpbar--over' : ''}`) : ''}
  </div>`;
}

function main(s) {
  const sum = L.monthSummary(s, ui.month);
  const current = ui.month === today().slice(0, 7);
  const left = sum.budget - sum.spent;
  const over = sum.budget > 0 && left < 0;
  const big = sum.budget
    ? `<div class="mon-big">${money(s, Math.abs(left))}</div>
       <div class="mon-cap">${over ? 'over budget' : 'left'} · ${money(s, sum.spent)} of ${money(s, sum.budget)} spent</div>
       ${xpbar(Math.min(100, Math.round((sum.spent / sum.budget) * 100)), `mon-bar${over ? ' imp-xpbar--over' : ''}`)}`
    : `<div class="mon-big">${money(s, sum.spent)}</div><div class="mon-cap">spent</div>`;
  const top = `<section class="imp-panel"><div class="imp-panel__body">${monthNav()}
    <div class="mon-hero${over ? ' is-over' : ''}">${big}
      <div class="mon-mini"><span>Paychecks <b class="mon-in">+${money(s, sum.income)}</b></span>${savedMini(s)}</div></div>
    ${current ? `<button class="imp-btn imp-btn--primary imp-btn--block mon-addbtn" data-m="add" data-kind="expense">${icon('plus')}Add</button>` : ''}
  </div></section>`;

  // Categories with a budget or spending this month (empty, unbudgeted ones stay out of the way)
  const shown = s.categories.filter((c) => c.budget > 0 || sum.byCat[c.id]);
  const orphan = Object.keys(sum.byCat).filter((id) => !s.categories.some((c) => c.id === id)).reduce((t, id) => t + sum.byCat[id], 0);
  const cats = shown.map((c) => catRow(s, c, sum.byCat[c.id] || 0)).join('') + (orphan ? catRow(s, { name: 'Deleted categories', icon: 'scroll', budget: 0 }, orphan) : '');

  return `${top}
    ${current ? accountsPanel(s) : ''}
    ${box('Budget', cats || '<p class="mon-empty">No budgets yet.</p>', '<button class="mon-link" data-m="page" data-page="budget">Edit</button>')}
    ${history(s)}`;
}

// Savings: how much the Savings account changed this month (before accounts: savings logged)
function savedMini(s) {
  const has = s.accounts?.some((a) => a.id === 'savings');
  const ch = has ? L.accountChange(s, 'savings', ui.month) : L.monthSummary(s, ui.month).saved;
  return `<span>Saved <b>${ch >= 0 ? '+' : '−'}${money(s, Math.abs(ch))}</b></span>`;
}

// ---- Accounts ----
const acctName = (s, id) => s.accounts.find((a) => a.id === id)?.name || 'Deleted account';
function accountsPanel(s) {
  if (!s.accounts?.length) {
    return box('Accounts', `<button class="mon-row" data-m="acct-setup">${icon('bank', 'mon-row__icon')}
      <span class="mon-row__mid"><span class="mon-row__name">Set up accounts</span><span class="mon-row__sub">Track your checking and savings balances</span></span>${icon('next', 'mon-row__go')}</button>`);
  }
  const bal = L.balances(s);
  const rows = s.accounts.map((a) => `<button class="mon-row" data-m="acct" data-id="${esc(a.id)}">${icon(a.icon || 'cash', 'mon-row__icon')}
      <span class="mon-row__mid"><span class="mon-row__name">${esc(a.name)}</span></span>
      <span class="mon-row__amt${bal[a.id] < 0 ? ' mon-over' : ''}">${money(s, bal[a.id])}</span></button>`).join('');
  return box('Accounts', `${rows}${paydayRow(s)}`, `<button class="mon-link" data-m="acct-add" aria-label="Add account">${icon('plus')}Add</button>`);
}

function openAccountSetup() {
  sheet.open({
    title: 'Set up accounts',
    body: `<p class="mon-note">Enter what each account has right now (check your bank). From here on, paychecks go into Checking, expenses come out of it, and savings move Checking → Savings.</p>
      <label class="imp-field"><span class="imp-label">Checking balance</span><span class="food-unit"><input class="imp-input" id="a-chk" inputmode="decimal" placeholder="0.00"><span>$</span></span></label>
      <label class="imp-field"><span class="imp-label">Savings balance</span><span class="food-unit"><input class="imp-input" id="a-sav" inputmode="decimal" placeholder="0.00"><span>$</span></span></label>
      <p class="food-err" id="a-err"></p>
      <button class="imp-btn imp-btn--primary imp-btn--block" id="a-save">Start tracking</button>`,
    onMount(b) {
      b.onclick = (ev) => {
        if (!ev.target.closest('#a-save')) return;
        const chk = L.toCents(b.querySelector('#a-chk').value || '0'), sav = L.toCents(b.querySelector('#a-sav').value || '0');
        if (Number.isNaN(chk) || Number.isNaN(sav)) { b.querySelector('#a-err').textContent = 'Enter the balances as numbers.'; return; }
        const since = new Date().toISOString();
        const start = { checking: chk, savings: sav };
        M.saveAccounts(L.DEFAULT_ACCOUNTS.map((a) => ({ ...a, start: start[a.id], since })));
        sheet.close();
        rerender();
        toast('Accounts set up');
      };
    },
  });
}

function openAccount(id) {
  const s = M.getState();
  const a = s.accounts.find((x) => x.id === id);
  if (!a) return;
  const bal = L.balances(s)[id];
  const builtIn = L.DEFAULT_ACCOUNTS.some((d) => d.id === id);
  sheet.open({
    title: a.name,
    body: `<div class="mon-pay"><span class="imp-label">Balance in Improve</span><b>${money(s, bal)}</b></div>
      <label class="imp-field"><span class="imp-label">Match my bank: real balance</span><span class="food-unit"><input class="imp-input" id="a-real" inputmode="decimal" placeholder="${(bal / 100).toFixed(2)}"><span>${esc(s.settings.currency)}</span></span></label>
      <p class="mon-note">Adds a correction for the difference (like a fee or something you forgot to log). It doesn't count as spending or saving.</p>
      <button class="imp-btn imp-btn--primary imp-btn--block" id="a-match">Match</button>
      <label class="imp-field"><span class="imp-label">Name</span><input class="imp-input" id="a-name" maxlength="24" value="${esc(a.name)}"></label>
      <button class="imp-btn imp-btn--secondary imp-btn--block" id="a-rename">Save name</button>
      ${builtIn ? '' : `<button class="imp-btn imp-btn--danger imp-btn--block" id="a-del">${icon('trash')}Delete account</button>`}`,
    onMount(b) {
      b.onclick = (ev) => {
        const t = ev.target.closest('button');
        if (!t) return;
        if (t.id === 'a-match') {
          const real = L.toCents(b.querySelector('#a-real').value);
          if (Number.isNaN(real)) return toast('Enter the real balance');
          const diff = real - L.balances(M.getState())[id];
          sheet.close();
          if (!diff) return toast('Already matches');
          M.upsertEntry({ kind: 'adjust', account: id, amount: diff, note: '', date: today() });
          rerender();
          toast(`${a.name} matched (${diff > 0 ? '+' : ''}${money(s, diff)})`);
        }
        if (t.id === 'a-rename') {
          const name = b.querySelector('#a-name').value.trim() || a.name;
          M.saveAccounts(M.getState().accounts.map((x) => (x.id === id ? { ...x, name } : x)));
          sheet.close(); rerender(); toast('Saved');
        }
        if (t.id === 'a-del' && confirm(`Delete "${a.name}"? Entries that used it stay in History.`)) {
          M.saveAccounts(M.getState().accounts.filter((x) => x.id !== id));
          sheet.close(); rerender(); toast('Account deleted');
        }
      };
    },
  });
}

function openAddAccount() {
  sheet.open({
    title: 'New account',
    body: `<label class="imp-field"><span class="imp-label">Name</span><input class="imp-input" id="n-name" maxlength="24" placeholder="e.g. Cash"></label>
      <label class="imp-field"><span class="imp-label">Balance right now</span><span class="food-unit"><input class="imp-input" id="n-bal" inputmode="decimal" placeholder="0.00"><span>$</span></span></label>
      <button class="imp-btn imp-btn--primary imp-btn--block" id="n-save">Add account</button>`,
    onMount(b) {
      b.onclick = (ev) => {
        if (!ev.target.closest('#n-save')) return;
        const name = b.querySelector('#n-name').value.trim();
        const start = L.toCents(b.querySelector('#n-bal').value || '0');
        if (!name) return toast('Name needed');
        if (Number.isNaN(start)) return toast('Enter the balance as a number');
        M.saveAccounts([...M.getState().accounts, { id: 'a_' + M.newCategoryId(), name, icon: 'cash', start, since: new Date().toISOString() }]);
        sheet.close(); rerender(); toast('Account added');
      };
    },
  });
}

// "Savings 85% · Car $20 · rest → Checking"
function splitText(s, sp) {
  const parts = (sp?.parts || []).filter((p) => p.value && p.account !== sp.rest && s.accounts?.some((a) => a.id === p.account))
    .map((p) => `${acctName(s, p.account)} ${p.mode === 'percent' ? `${p.value}%` : money(s, p.value)}`);
  return [...parts, `rest → ${acctName(s, sp?.rest || 'checking')}`].join(' · ');
}

// One line under the accounts: next payday and how it splits. "Log" shows on payday weeks.
function paydayRow(s) {
  if (!s.settings.setup) {
    return `<button class="mon-row" data-m="page" data-page="settings">${icon('calendar', 'mon-row__icon')}
      <span class="mon-row__mid"><span class="mon-row__name">Set up paydays</span><span class="mon-row__sub">Pay schedule and paycheck split</span></span>${icon('next', 'mon-row__go')}</button>`;
  }
  const st = L.saveStatus(s);
  const next = L.nextPayday(s.settings.pay, today());
  const when = next === today() ? 'today' : next ? shortDate(next) : '—';
  const sub = st.pending ? 'Payday: log the paycheck and it splits itself' : splitText(s, s.settings.split);
  return `<div class="mon-row mon-payrow">${icon('calendar', 'mon-row__icon')}
    <span class="mon-row__mid"><span class="mon-row__name">Next payday ${esc(when)}</span><span class="mon-row__sub">${esc(sub)}</span></span>
    ${st.pending ? `<button class="imp-btn imp-btn--sm imp-btn--primary" data-m="add" data-kind="income">Log</button>` : ''}</div>`;
}

// History: everything logged this month, newest first, with the time it was logged
function history(s) {
  const [start, end] = L.monthRange(ui.month);
  const list = L.inRange(s.entries, start, end).sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
  const cat = (id) => s.categories.find((c) => c.id === id);
  const days = [...new Set(list.map((e) => e.date))];
  const rows = days.map((d) => `<div class="mon-day">${d === today() ? 'Today' : shortDate(d)}</div>` + list.filter((e) => e.date === d).map((e) => {
    const c = e.kind === 'expense' ? cat(e.cat) : null;
    const ic = { income: 'bank', saving: 'piggy', transfer: 'bank', adjust: 'scroll' }[e.kind] || c?.icon || 'cash';
    const title = e.kind === 'adjust' ? 'Balance fix' : e.kind === 'transfer' ? e.note || `${acctName(s, e.from)} → ${acctName(s, e.to)}` : e.note || (e.kind === 'expense' ? c?.name || 'Expense' : KIND[e.kind]);
    const what = e.kind === 'adjust' ? `Matched ${acctName(s, e.account)} to bank` : e.kind === 'transfer' ? 'Moved money'
      : L.beforeTracking(s, e) ? 'Before tracking' : e.kind === 'expense' ? (e.note ? c?.name || 'Other' : '')
      : e.kind === 'income' && e.splits?.length > 1 ? e.splits.map((x) => `${acctName(s, x.account)} ${money(s, x.amount)}`).join(' · ') : e.note ? KIND[e.kind] : '';
    const time = e.at && dayKey(new Date(e.at)) === e.date ? timeOf(e.at) : '';
    const sub = [time, what].filter(Boolean).join(' · ');
    return `<button class="mon-row" data-m="edit" data-id="${e.id}">${icon(ic, `mon-row__icon mon-k-${e.kind}`)}
      <span class="mon-row__mid"><span class="mon-row__name">${esc(title)}</span>${sub ? `<span class="mon-row__sub">${esc(sub)}</span>` : ''}</span>
      <span class="mon-row__amt mon-k-${e.kind}">${e.kind === 'expense' || e.kind === 'transfer' || e.amount < 0 ? '' : '+'}${money(s, e.amount)}</span></button>`;
  }).join('')).join('');
  return box('History', rows || '<p class="mon-empty">Nothing logged this month.</p>', list.length ? `${list.length} ${list.length === 1 ? 'entry' : 'entries'}` : '');
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
  return box('Categories', `<div class="mon-stack">
    <p class="mon-note">A monthly limit for each category. Leave it blank for no limit.</p>
    ${rows}
    <button class="imp-btn imp-btn--secondary imp-btn--block" data-m="add-cat">${icon('plus')}Add category</button>
    <button class="imp-btn imp-btn--primary imp-btn--block" data-m="save-budget">Save budgets</button></div>`, `${money(s, total)} a month`);
}

function settings(s) {
  const p = s.settings.pay;
  const f = ui.payFreq || p.freq;
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
      ${fields}</div>`)}
    ${splitBox(s)}
    ${box('Other', `<div class="mon-stack">
      <label class="imp-field"><span class="imp-label">Currency symbol</span><input class="imp-input" id="s-cur" maxlength="3" value="${esc(s.settings.currency)}"></label>
      <p class="food-err" id="s-err"></p>
      <button class="imp-btn imp-btn--primary imp-btn--block" data-m="save-settings">Save settings</button>
      <p class="mon-note">Money is included in the backup on the You page.</p></div>`)}`;
}

// Paycheck split editor (works on a draft until Save settings)
const splitDraft = (s) => (ui.split ||= structuredClone(s.settings.split));
function splitBox(s) {
  const accts = s.accounts || [];
  if (!accts.length) {
    return box('Paycheck split', `<div class="mon-stack"><p class="mon-note">Set up your accounts on the Money page first. Then choose how each paycheck is divided: a % or a fixed amount into any account, the rest into your spending account.</p></div>`);
  }
  const sp = splitDraft(s);
  const rows = accts.filter((a) => a.id !== sp.rest).map((a) => {
    const part = sp.parts.find((x) => x.account === a.id) || { mode: 'percent', value: 0 };
    const val = part.value ? (part.mode === 'percent' ? part.value : part.value / 100) : '';
    return `<div class="mon-split">${icon(a.icon || 'cash', 'mon-split__icon')}<span class="mon-split__name">${esc(a.name)}</span>
      <div class="imp-seg mon-split__mode"><button data-m="split-mode" data-id="${esc(a.id)}" data-mode="percent" class="${part.mode === 'percent' ? 'is-on' : ''}">%</button><button data-m="split-mode" data-id="${esc(a.id)}" data-mode="amount" class="${part.mode === 'amount' ? 'is-on' : ''}">${esc(s.settings.currency)}</button></div>
      <input class="imp-input mon-split__val" data-split="${esc(a.id)}" inputmode="decimal" placeholder="0" value="${val}" aria-label="${esc(a.name)} share"></div>`;
  }).join('');
  const ex = L.splitPaycheck(sp, 100000).map((x) => `${acctName(s, x.account)} ${money(s, x.amount)}`).join(' · ');
  return box('Paycheck split', `<div class="mon-stack">
    <p class="mon-note">Each paycheck is divided as it's logged. Set a % or a fixed amount for any account; leave blank for none.</p>
    ${rows}
    <div class="imp-field"><span class="imp-label">Rest goes to</span><div class="mon-chips">${accts.map((a) => `<button type="button" data-m="split-rest" data-id="${esc(a.id)}" class="mon-chip${sp.rest === a.id ? ' is-on' : ''}">${icon(a.icon || 'cash')}${esc(a.name)}</button>`).join('')}</div></div>
    <p class="mon-note" id="split-ex">Example: a $1,000 paycheck → ${esc(ex)}</p>
    <p class="mon-note">Your saving habit ticks in payday weeks once the paycheck is logged with this much set aside.</p></div>`);
}

// ---------- Sheets ----------
function openEntry(kind, e = null) {
  const s = M.getState();
  const cur = e || { kind, amount: 0, cat: s.categories[0]?.id, note: '', date: today() };
  let k = cur.kind;
  let cat = cur.cat || s.categories[0]?.id;
  // Accounts (once set up): which account an entry uses
  const accts = s.accounts || [];
  const pairFor = (kind) => (kind === 'transfer' ? ['savings', 'checking'] : ['checking', 'savings']);
  let acct = cur.account || 'checking';
  let [from, to] = cur.from ? [cur.from, cur.to] : pairFor(k);
  const chips = (field, sel) => `<div class="mon-chips">${accts.map((a) => `<button type="button" data-acct="${field}" data-id="${esc(a.id)}" class="mon-chip${sel === a.id ? ' is-on' : ''}">${icon(a.icon || 'cash')}${esc(a.name)}</button>`).join('')}</div>`;
  // Paycheck split: pre-filled from Settings, editable for this one paycheck; the rest is worked out live
  const rule = s.settings.split;
  const restAcct = accts.find((a) => a.id === rule.rest) || accts[0];
  const splitAccts = accts.filter((a) => a.id !== restAcct?.id);
  const over = {}; // amounts typed by hand for this paycheck
  if (cur.splits) for (const x of cur.splits) if (x.account !== restAcct?.id) over[x.account] = x.amount;
  const shares = (amount) => {
    const def = Object.fromEntries(L.splitPaycheck(rule, amount).map((x) => [x.account, x.amount]));
    const vals = splitAccts.map((a) => [a, a.id in over ? over[a.id] : def[a.id] || 0]);
    return { vals, rest: amount - vals.reduce((t, [, v]) => t + v, 0) };
  };
  const splitRows = (amount) => {
    const { vals, rest } = shares(amount);
    return `${vals.map(([a, v]) => `<div class="mon-split">${icon(a.icon || 'cash', 'mon-split__icon')}<span class="mon-split__name">${esc(a.name)}</span>
        <input class="imp-input mon-split__val" data-esplit="${esc(a.id)}" inputmode="decimal" placeholder="0" value="${v ? v / 100 : ''}" aria-label="${esc(a.name)} amount"></div>`).join('')}
      <div class="mon-split is-rest">${icon(restAcct.icon || 'cash', 'mon-split__icon')}<span class="mon-split__name">${esc(restAcct.name)} <small>(rest)</small></span><b id="e-rest" class="${rest < 0 ? 'mon-over' : ''}">${money(s, rest)}</b></div>`;
  };
  const acctFields = () => {
    if (!accts.length) return '';
    if (k === 'expense') return `<div class="imp-field"><span class="imp-label">Paid from</span>${chips('acct', acct)}</div>`;
    if (k === 'income') return `<div class="imp-field"><span class="imp-label">Split</span><div id="e-split">${splitRows(cur.amount || 0)}</div></div>`;
    return `<div class="imp-field"><span class="imp-label">From</span>${chips('from', from)}</div><div class="imp-field"><span class="imp-label">To</span>${chips('to', to)}</div>`;
  };
  // "Move" needs accounts; the old "To savings" only shows without accounts (or when editing an old one)
  const kinds = Object.entries(KIND).filter(([id]) => (id !== 'transfer' || accts.length) && (id !== 'saving' || !accts.length || cur.kind === 'saving'));
  const body = () => `
    <div class="imp-seg">${kinds.map(([id, v]) => `<button type="button" data-k="${id}" class="${k === id ? 'is-on' : ''}">${v}</button>`).join('')}</div>
    <label class="imp-field"><span class="imp-label">Amount</span><span class="food-unit"><input class="imp-input mon-amt" id="e-amt" inputmode="decimal" placeholder="0.00" value="${cur.amount ? cur.amount / 100 : ''}" autocomplete="off"><span>${esc(s.settings.currency)}</span></span></label>
    ${k === 'expense' ? `<div class="imp-field"><span class="imp-label">Category</span><div class="mon-chips">${s.categories.map((c) => `<button type="button" data-cat="${c.id}" class="mon-chip${cat === c.id ? ' is-on' : ''}">${icon(c.icon)}${esc(c.name)}</button>`).join('')}</div></div>` : ''}
    ${acctFields()}
    <label class="imp-field"><span class="imp-label">Note (optional)</span><input class="imp-input" id="e-note" maxlength="60" value="${esc(cur.note || '')}" placeholder="${k === 'expense' ? 'e.g. Chipotle' : k === 'income' ? 'e.g. Job' : 'e.g. Savings account'}" autocomplete="off"></label>
    <label class="imp-field"><span class="imp-label">Date</span><input class="imp-input" type="date" id="e-date" value="${cur.date}" max="${today()}"></label>
    <p class="food-err" id="e-err"></p>
    <button class="imp-btn imp-btn--primary imp-btn--block" id="e-save">${e ? 'Save' : `Add ${KIND[k].toLowerCase()}`}</button>
    ${e ? `<button class="imp-btn imp-btn--danger imp-btn--block" id="e-del">${icon('trash')}Delete</button>` : ''}`;
  sheet.open({
    title: k === 'transfer' ? (e ? 'Edit move' : 'Move money') : e ? `Edit ${KIND[cur.kind].toLowerCase()}` : `New ${KIND[k].toLowerCase()}`,
    body: body(),
    onMount(b) {
      const keep = () => { cur.amount = L.toCents(b.querySelector('#e-amt').value) || 0; cur.note = b.querySelector('#e-note').value; cur.date = b.querySelector('#e-date').value || today(); };
      const redraw = () => { keep(); b.innerHTML = body(); };
      b.onclick = (ev) => {
        const t = ev.target.closest('button');
        if (!t) return;
        if (t.dataset.k) { k = t.dataset.k; if (!e) [from, to] = pairFor(k); return redraw(); }
        if (t.dataset.acct) {
          if (t.dataset.acct === 'acct') acct = t.dataset.id;
          if (t.dataset.acct === 'from') from = t.dataset.id;
          if (t.dataset.acct === 'to') to = t.dataset.id;
          t.parentElement.querySelectorAll('.mon-chip').forEach((x) => x.classList.toggle('is-on', x === t));
          return;
        }
        if (t.dataset.cat) { cat = t.dataset.cat; b.querySelectorAll('.mon-chip').forEach((x) => x.classList.toggle('is-on', x === t)); return; }
        if (t.id === 'e-save') {
          const amount = L.toCents(b.querySelector('#e-amt').value);
          if (!(amount > 0)) { b.querySelector('#e-err').textContent = 'Enter an amount above 0.'; return; }
          const date = b.querySelector('#e-date').value || today();
          const moving = k === 'saving' || k === 'transfer';
          if (accts.length && moving && from === to) { b.querySelector('#e-err').textContent = 'Pick two different accounts.'; return; }
          let splits;
          if (k === 'income' && accts.length) {
            const { vals, rest } = shares(amount);
            if (rest < 0) { b.querySelector('#e-err').textContent = 'The split is more than the paycheck.'; return; }
            splits = vals.filter(([, v]) => v > 0).map(([a, v]) => ({ account: a.id, amount: v }));
            if (rest > 0 || !splits.length) splits.push({ account: restAcct.id, amount: rest });
          }
          const entry = { ...(e || {}), kind: k, amount, note: b.querySelector('#e-note').value.trim(), date, cat: k === 'expense' ? cat : undefined, splits,
            account: accts.length && k === 'expense' ? acct : undefined, from: accts.length && moving ? from : undefined, to: accts.length && moving ? to : undefined };
          sheet.close();
          changed(() => M.upsertEntry(entry), [entry.date, e?.date]);
          toast(e ? 'Saved' : k === 'transfer' ? 'Moved' : k === 'saving' ? 'Moved to savings' : `${KIND[k]} added`);
        }
        if (t.id === 'e-del' && confirm('Delete this entry?')) {
          sheet.close();
          changed(() => M.deleteEntry(e.id), [e.date]);
          toast('Deleted');
        }
      };
      // Live split: typing the paycheck re-splits it; typing an account's share updates the rest
      b.oninput = (ev) => {
        if (k !== 'income' || !accts.length) return;
        const t = ev.target;
        if (t.id === 'e-amt') { const box2 = b.querySelector('#e-split'); if (box2) box2.innerHTML = splitRows(L.toCents(t.value) || 0); }
        if (t.dataset.esplit) {
          over[t.dataset.esplit] = L.toCents(t.value) || 0;
          const { rest } = shares(L.toCents(b.querySelector('#e-amt').value) || 0);
          const r = b.querySelector('#e-rest');
          r.textContent = money(s, rest);
          r.classList.toggle('mon-over', rest < 0);
        }
      };
      if (!e) setTimeout(() => b.querySelector('#e-amt')?.focus(), 50);
    },
  });
}

// ---------- Events ----------
export function bind(root) {
  const mine = () => root.dataset.tab === 'money';

  root.addEventListener('input', (ev) => {
    if (!mine()) return;
    const t = ev.target;
    if (ui.page === 'settings' && t.dataset.split != null) {
      const sp = splitDraft(M.getState());
      const part = sp.parts.find((x) => x.account === t.dataset.split) || sp.parts[sp.parts.push({ account: t.dataset.split, mode: 'percent', value: 0 }) - 1];
      const raw = t.value.trim();
      part.value = !raw ? 0 : part.mode === 'percent' ? Number(raw) : L.toCents(raw);
      const ex = ctx.root.querySelector('#split-ex');
      if (ex && !Number.isNaN(part.value)) ex.textContent = `Example: a $1,000 paycheck → ${L.splitPaycheck(sp, 100000).map((x) => `${acctName(M.getState(), x.account)} ${money(M.getState(), x.amount)}`).join(' · ')}`;
      return;
    }
    if (ui.page !== 'budget') return;
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
      case 'page': openPage(el.dataset.page); break;
      case 'back': openPage(null); break;
      case 'month': ui.month = L.shiftMonth(ui.month, Number(el.dataset.dir)); rerender(); break;
      case 'add': openEntry(el.dataset.kind); break;
      case 'edit': {
        const entry = s.entries.find((e) => e.id === el.dataset.id);
        if (entry?.kind === 'adjust') {
          if (confirm(`Remove this ${money(s, entry.amount)} balance fix?`)) { M.deleteEntry(entry.id); rerender(); toast('Removed'); }
        } else openEntry(null, entry);
        break;
      }
      case 'acct-setup': openAccountSetup(); break;
      case 'acct': openAccount(el.dataset.id); break;
      case 'acct-add': openAddAccount(); break;

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
        openPage(null);
        toast('Budgets saved');
        break;
      }

      case 'freq': keepTyped(); ui.payFreq = el.dataset.freq; rerender(); break;
      case 'split-mode': {
        keepTyped();
        const sp = splitDraft(s);
        const part = sp.parts.find((x) => x.account === el.dataset.id) || sp.parts[sp.parts.push({ account: el.dataset.id, mode: 'percent', value: 0 }) - 1];
        if (part.mode !== el.dataset.mode) { part.mode = el.dataset.mode; part.value = 0; delete (ui.typed || {})[`split-${el.dataset.id}`]; }
        rerender();
        break;
      }
      case 'split-rest': keepTyped(); splitDraft(s).rest = el.dataset.id; rerender(); break;
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
  ctx.root.innerHTML = `<div class="screen money">${nav('Budgets')}${budget(s)}</div>`;
}

function saveSettings(s) {
  const err = ctx.root.querySelector('#s-err');
  const freq = ui.payFreq || s.settings.pay.freq;
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
  let split = s.settings.split;
  if (ui.split) {
    const sp = ui.split;
    const parts = sp.parts.filter((x) => x.value > 0 && x.account !== sp.rest && s.accounts.some((a) => a.id === x.account));
    if (sp.parts.some((x) => Number.isNaN(x.value) || x.value < 0)) { err.textContent = 'Check the split amounts.'; return; }
    const pct = parts.filter((x) => x.mode === 'percent').reduce((t, x) => t + x.value, 0);
    if (pct > 100) { err.textContent = `The split adds up to ${pct}%. Keep it at 100% or less.`; return; }
    split = { rest: sp.rest, parts };
  }
  const currency = ctx.root.querySelector('#s-cur').value.trim() || '$';
  ui.payFreq = null;
  ui.split = null;
  ui.typed = null;
  ui.page = null;
  changed(() => M.saveSettings({ pay, split, currency, setup: true }));
  window.scrollTo(0, 0);
  toast('Settings saved');
}

export const recheck = () => recheckMoney();

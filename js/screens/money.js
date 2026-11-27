// Money: one page (month summary, accounts, budget, history). Budgets and paychecks open from ⋯ in the top bar.
import * as L from '../money/logic.js';
import * as M from '../money/store.js';
import { recheckMoney } from '../money/autocheck.js';
import * as Stats from '../stats.js';
import { celebrate } from './today.js';
import { dayKey, fromDayKey, periodRange } from '../dates.js';
import { esc, icon, xpbar, toast, sheet } from '../ui.js';

const KIND = { expense: 'Expense', income: 'Paycheck', saving: 'To savings', transfer: 'Move' };

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
  const body = ui.page === 'settings' ? nav('Paychecks & cash back') + settings(s) : ui.page === 'payday' ? nav('Payday') + paydayPage(s) : main(s);
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
  ui.page = page; ui.cbAcct = null; ui.payFreq = null; ui.split = null; ui.typed = null; ui.pd = null;
  rerender();
  window.scrollTo(0, 0);
}

/** ⋯ in the top bar: the savings goal, and paychecks & cash back. */
export function openMenu() {
  const s = M.getState();
  const g = s.settings.goal;
  const row = (act, ic, title, sub) => `<button class="g-row food-menu-row" data-go="${act}"><span class="g-icon">${icon(ic)}</span><span class="g-main"><span class="g-title">${title}</span><span class="g-sub">${esc(sub)}</span></span>${icon('next')}</button>`;
  sheet.open({
    title: 'Money',
    body: `<div class="group">
      ${row('goal', 'star', 'Savings goal', `${g.name} · ${money(s, g.target)}`)}
      ${row('settings', 'piggy', 'Paychecks & cash back', s.settings.setup ? `${L.FREQS[s.settings.pay.freq]} · ${esc(paydayRule(s))}${s.settings.cashback?.rate ? ` · ${s.settings.cashback.rate}% cash back` : ''}` : 'Pay schedule, cash back')}
    </div>`,
    onMount(b) {
      b.onclick = (e) => {
        const p = e.target.closest('[data-go]')?.dataset.go;
        if (!p) return;
        sheet.close();
        if (p === 'goal') setTimeout(openGoal, 250); else openPage(p);
      };
    },
  });
}

const money = (s, c) => L.fmtMoney(c, s.settings.currency);
const monthNav = () => `<div class="mon-nav"><button class="food-back" data-m="month" data-dir="-1" aria-label="Previous month">${icon('prev')}</button>
  <span class="mon-nav__title">${esc(L.monthLabel(ui.month))}</span>
  <button class="food-back" data-m="month" data-dir="1" aria-label="Next month" ${ui.month >= today().slice(0, 7) ? 'disabled' : ''}>${icon('next')}</button></div>`;

// The savings goal bar (e.g. the motorcycle): that account's balance toward the target
function goalPanel(s) {
  const g = s.settings.goal;
  const have = L.balances(s)[g.account] ?? 0;
  const p = g.target > 0 ? Math.min(100, Math.round((have / g.target) * 100)) : 0;
  const left = g.target - have;
  return `<section class="imp-panel mon-goal" data-m="goal"><div class="imp-panel__body">
    <div class="mon-goal__top"><span class="mon-goal__name">${icon('star')}${esc(g.name)}</span><span class="mon-goal__pct">${p}%</span></div>
    <div class="mon-goal__big">${money(s, have)} <small>of ${money(s, g.target)}</small></div>
    ${xpbar(p, 'mon-goal__bar')}
    <p class="mon-goal__sub">${left > 0 ? `${money(s, left)} to go · in ${esc(acctName(s, g.account))}` : 'Goal reached'}</p>
  </div></section>`;
}

// This week: the two money jobs as tick boxes. Tap one to do it (check-in sheet / Payday page).
function weekPanel(s) {
  const [ws, we] = periodRange('weekly');
  const ci = L.checkins(s).filter((e) => !e.source && e.date >= ws && e.date <= we).pop();
  const paid = thisWeekPaydays(s).pop();
  const next = L.nextPayday(s.settings.pay, today());
  const when = next === today() ? 'today' : next ? shortDate(next) : '';
  const row = (done, m, page, title, sub) => `<button class="mon-week__row${done ? ' is-done' : ''}" data-m="${m}"${page ? ` data-page="${page}"` : ''}>
      <span class="imp-check${done ? ' is-on' : ''}">${icon('check')}</span>
      <span class="mon-row__mid"><span class="mon-week__title">${title}</span><span class="mon-row__sub">${esc(sub)}</span></span>${icon('next', 'mon-row__go')}</button>`;
  const ciSub = ci ? `Done ${shortDate(ci.date)}` : we === today() ? 'Today' : `Due ${shortDate(we)}`;
  const paySub = paid ? `Done ${shortDate(paid.date)} · ${paid.splits.map((x) => `${acctName(s, x.account)} ${money(s, x.amount)}`).join(' · ')}`
    : `${when ? `Payday ${when} · ` : ''}${paydayRule(s)}`;
  return box('This week', `${row(!!ci, 'checkin', '', 'Sunday check-in', ciSub)}${row(!!paid, 'page', 'payday', 'Split my paycheck', paySub)}`,
    `${(ci ? 1 : 0) + (paid ? 1 : 0)}/2`);
}

// The weekly check-in: what you spent and saved, worked out from your bank balances
function checkinPanel(s) {
  const last = L.lastCheckin(s);
  if (!last) return '';
  const r = L.checkinResult(s, last);
  const saved = r.change.savings ?? 0;
  const spent = L.weekSpent(s, new Date(last.at));
  return box('Last check-in', `<div class="mon-stack">
      <div class="mon-ci__stats">
        <div><span>Spent that week</span><b>${money(s, spent)}</b></div>
        <div><span>${esc(acctName(s, 'savings'))}</span><b class="${saved >= 0 ? 'mon-in' : 'mon-over'}">${saved >= 0 ? '+' : '−'}${money(s, Math.abs(saved))}</b></div>
        ${r.extra ? `<div><span>Extra in</span><b class="mon-in">+${money(s, r.extra)}</b></div>` : ''}
      </div></div>`, shortDate(last.date));
}

// Graph: one line per account, every check-in, all time
const LINE = { checking: '#3b82f6', savings: '#22c55e' };
const OTHER = ['#a855f7', '#f97316', '#eab308', '#ef4444'];
function graphPanel(s) {
  // Real numbers only: each account's starting balance and what the bank showed at each check-in
  const series = L.balanceSeries(s, undefined, { withNow: false }).filter((x) => x.points.length);
  const pts = series.flatMap((x) => x.points);
  if (!series.length || L.checkins(s).length < 1) return box('Over time', '<p class="mon-empty">Your first check-in starts the graph.</p>');
  const t = (p) => new Date(p.at).getTime();
  const t0 = Math.min(...pts.map(t)), t1 = Math.max(...pts.map(t), t0 + 86400000);
  let o = 0;
  const color = (id) => LINE[id] || OTHER[o++ % OTHER.length];
  // One small graph per account, each on its own scale, so a drop always shows as a drop (below $0 too)
  const W = 320, H = 112, L0 = 34, R0 = 34, T0 = 30, B0 = 30;
  const x = (p) => L0 + ((t(p) - t0) / (t1 - t0)) * (W - L0 - R0);
  const chart = (sr) => {
    const c = color(sr.id);
    const vs = sr.points.map((p) => p.v);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (hi - lo < 100) { const mid = (hi + lo) / 2; lo = mid - 50; hi = mid + 50; } // a steady balance draws a flat line in the middle
    const y = (v) => T0 + (1 - (v - lo) / (hi - lo)) * (H - T0 - B0);
    // Value labels: each one tries spots around its dot (above, below, right, left, then further out) and takes the
    // first that stays inside the graph without touching another label or dot. Newest first, so it always gets the best spot.
    const pos = sr.points.map((p) => ({ px: x(p), py: y(p.v), txt: money(s, p.v) }));
    const boxes = pos.map((q) => ({ x1: q.px - 4.5, x2: q.px + 4.5, y1: q.py - 4.5, y2: q.py + 4.5 })); // the dots
    const hit = (r) => boxes.some((o) => r.x1 < o.x2 && r.x2 > o.x1 && r.y1 < o.y2 && r.y2 > o.y1);
    const placed = [];
    for (let i = pos.length - 1; i >= 0; i--) {
      const q = pos[i];
      const w = q.txt.length * 5.6 + 2;
      const spots = [];
      for (const dy of [0, -11, 11, -22, 22]) {
        spots.push(['middle', q.px, q.py - 8 + Math.min(0, dy)], ['middle', q.px, q.py + 15 + Math.max(0, dy)]);
        spots.push(['start', q.px + 7, q.py + 3.5 + dy], ['end', q.px - 7, q.py + 3.5 + dy]);
      }
      for (const [anchor, tx, ty] of spots) {
        const x1 = anchor === 'start' ? tx : anchor === 'end' ? tx - w : tx - w / 2;
        const r = { x1, x2: x1 + w, y1: ty - 8, y2: ty + 2 };
        if (r.x1 < 0 || r.x2 > W || r.y1 < 0 || r.y2 > H || hit(r)) continue;
        boxes.push(r);
        placed.push(`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}" fill="${c}" class="mon-graph__val">${esc(q.txt)}</text>`);
        break;
      }
    }
    const labels = placed.join('');
    const zero = lo < 0 && hi > 0 ? `<line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="mon-graph__zero"/>` : '';
    return `<div class="mon-graph__row"><span class="mon-graph__name"><i style="background:${c}"></i>${esc(sr.name)}</span>
      <svg class="mon-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(sr.name)} at each check-in">
        <line x1="0" x2="${W}" y1="${H - 1}" y2="${H - 1}" class="mon-graph__grid"/>${zero}
        <polyline fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${sr.points.map((p) => `${x(p).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}"/>
        ${sr.points.map((p) => `<circle cx="${x(p).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="${c}" class="mon-graph__dot"/>`).join('')}
        ${labels}</svg></div>`;
  };
  const fmtD = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return box('Over time', `${series.map(chart).join('')}
    <div class="mon-graph__axis"><span>${fmtD(t0)}</span><span>${fmtD(t1)}</span></div>`);
}

function main(s) {
  if (!s.accounts?.length) return `${goalPanel(s)}${accountsPanel(s)}`;
  return `${goalPanel(s)}${weekPanel(s)}${checkinPanel(s)}${accountsPanel(s)}${graphPanel(s)}${history(s)}`;
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
  const total = s.accounts.reduce((t, a) => t + (bal[a.id] || 0), 0);
  const totalRow = `<div class="mon-row mon-total"><span class="mon-row__mid"><span class="mon-row__name">Total</span></span><span class="mon-row__amt">${money(s, total)}</span></div>`;
  return box('Accounts', `${rows}${totalRow}
    <button class="imp-btn imp-btn--secondary imp-btn--block mon-update" data-m="update-bal">${icon('bank')}Update balances</button>
    ${paydayRow(s)}${cashbackRow(s)}`, `<button class="mon-link" data-m="acct-add" aria-label="Add account">${icon('plus')}Add</button>`);
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

// "Spend 40% up to $200 · Save 40% · Invest 20%"
function paydayRule(s) {
  const pd = s.settings.payday;
  const inv = L.investingId(s);
  return `${acctName(s, 'checking')} ${pd.pct.checking}% up to ${money(s, pd.cap)} · ${acctName(s, 'savings')} ${pd.pct.savings}%${inv ? ` · ${acctName(s, inv)} ${pd.pct.investing}%` : ''}`;
}

// One line under the accounts: next payday and how it splits (split it on the Payday page)
function paydayRow(s) {
  if (!s.settings.setup) {
    return `<button class="mon-row" data-m="page" data-page="settings">${icon('calendar', 'mon-row__icon')}
      <span class="mon-row__mid"><span class="mon-row__name">Set up paydays</span><span class="mon-row__sub">Pay schedule</span></span>${icon('next', 'mon-row__go')}</button>`;
  }
  const next = L.nextPayday(s.settings.pay, today());
  const when = next === today() ? 'today' : next ? shortDate(next) : '—';
  const sub = paydayRule(s);
  return `<div class="mon-row mon-payrow">${icon('calendar', 'mon-row__icon')}
    <span class="mon-row__mid"><span class="mon-row__name">Next payday ${esc(when)}</span><span class="mon-row__sub">${esc(sub)}</span></span>
</div>`;
}

// Card cash back: the estimate for this month so far, and a quick "Log" for the deposit when it lands
// (the bank pays last month's cash back early this month).
function cashbackRow(s) {
  const cb = s.settings.cashback || {};
  if (!(cb.rate > 0)) return '';
  const mk = today().slice(0, 7);
  const last = L.shiftMonth(mk, -1);
  const [a, b] = L.monthRange(mk);
  const got = s.entries.filter((e) => e.kind === 'cashback' && e.date >= a && e.date <= b);
  const sofar = `≈ ${money(s, L.cashbackFor(s, mk))} so far in ${L.monthLabel(mk).split(' ')[0]}`;
  const sub = got.length
    ? `Got ${money(s, got.reduce((t, e) => t + e.amount, 0))} on ${shortDate(got[got.length - 1].date).replace(/^\w+, /, '')} · ${sofar}`
    : `≈ ${money(s, L.cashbackFor(s, last))} for ${L.monthLabel(last).split(' ')[0]} · ${sofar}`;
  return `<div class="mon-row mon-payrow">${icon('star', 'mon-row__icon')}
    <span class="mon-row__mid"><span class="mon-row__name">Cash back · ${cb.rate}%</span><span class="mon-row__sub">${esc(sub)}</span></span>
    ${got.length ? '' : '<button class="imp-btn imp-btn--sm imp-btn--secondary" data-m="cashback">Log</button>'}</div>`;
}

function openCashback(e = null) {
  const s = M.getState();
  const cb = s.settings.cashback || {};
  const last = L.shiftMonth(today().slice(0, 7), -1);
  let acct = e?.account || cb.account || 'savings';
  const accts = s.accounts || [];
  sheet.open({
    title: e ? 'Edit cash back' : 'Log cash back',
    body: `<label class="imp-field"><span class="imp-label">Amount</span><span class="food-unit"><input class="imp-input mon-amt" id="c-amt" inputmode="decimal" placeholder="0.00" value="${e ? e.amount / 100 : (L.cashbackFor(s, last) / 100 || '')}"><span>${esc(s.settings.currency)}</span></span></label>
      ${e ? '' : `<p class="mon-note">Filled in with ${cb.rate}% of ${L.monthLabel(last).split(' ')[0]}'s logged spending. Change it to what the bank actually paid.</p>`}
      ${accts.length ? `<div class="imp-field"><span class="imp-label">Into</span><div class="mon-chips">${accts.map((a) => `<button type="button" data-acct="${esc(a.id)}" class="mon-chip${acct === a.id ? ' is-on' : ''}">${icon(a.icon || 'cash')}${esc(a.name)}</button>`).join('')}</div></div>` : ''}
      <label class="imp-field"><span class="imp-label">Date</span><input class="imp-input" type="date" id="c-date" value="${e?.date || today()}" max="${today()}"></label>
      <p class="food-err" id="c-err"></p>
      <button class="imp-btn imp-btn--primary imp-btn--block" id="c-save">${e ? 'Save' : 'Add cash back'}</button>
      ${e ? `<button class="imp-btn imp-btn--danger imp-btn--block" id="c-del">${icon('trash')}Delete</button>` : ''}`,
    onMount(b) {
      b.onclick = (ev) => {
        const t = ev.target.closest('button');
        if (!t) return;
        if (t.dataset.acct) { acct = t.dataset.acct; b.querySelectorAll('.mon-chip').forEach((x) => x.classList.toggle('is-on', x === t)); return; }
        if (t.id === 'c-save') {
          const amount = L.toCents(b.querySelector('#c-amt').value);
          if (!(amount > 0)) { b.querySelector('#c-err').textContent = 'Enter an amount above 0.'; return; }
          const date = b.querySelector('#c-date').value || today();
          sheet.close();
          changed(() => M.upsertEntry({ ...(e || {}), kind: 'cashback', amount, account: acct, note: 'Cash back', date }), [date, e?.date]);
          toast(e ? 'Saved' : 'Cash back added');
        }
        if (t.id === 'c-del' && confirm('Delete this cash back?')) { sheet.close(); changed(() => M.deleteEntry(e.id), [e.date]); toast('Deleted'); }
      };
    },
  });
}

// Sunday check-in: type what the bank shows for each account (filled in with what Improve expects)
function openCheckin(e = null, source = e?.source || null) {
  const s = M.getState();
  const exp = e ? e.balances : L.balances(s);
  const upd = source === 'update';
  sheet.open({
    title: e ? (source ? 'Edit balances' : 'Edit check-in') : upd ? 'Update balances' : 'Weekly check-in',
    body: `<p class="mon-note">${upd ? 'Open Greenlight and type each balance. This re-syncs Improve with your bank (it isn\'t your Sunday check-in).' : 'Open your bank app and type each balance. Improve works out what you spent and saved this week.'}</p>
      ${s.accounts.map((a) => `<label class="imp-field"><span class="imp-label">${icon(a.icon || 'cash')} ${esc(a.name)}</span><span class="food-unit"><input class="imp-input" data-bal="${esc(a.id)}" inputmode="decimal" placeholder="${((exp[a.id] ?? 0) / 100).toFixed(2)}" value="${e && a.id in e.balances ? e.balances[a.id] / 100 : ''}"><span>${esc(s.settings.currency)}</span></span></label>`).join('')}
      <p class="mon-note">Leave one blank if it hasn't changed.</p>
      <p class="food-err" id="ci-err"></p>
      <button class="imp-btn imp-btn--primary imp-btn--block" id="ci-save">${e ? 'Save' : 'Check in'}</button>
      ${e ? `<button class="imp-btn imp-btn--danger imp-btn--block" id="ci-del">${icon('trash')}Delete</button>` : ''}`,
    onMount(b) {
      b.onclick = (ev) => {
        const t = ev.target.closest('button');
        if (!t) return;
        if (t.id === 'ci-save') {
          // A blank account hasn't changed: it isn't stored, so it follows its balance (and any fix to an earlier entry)
          const balances = {};
          for (const inp of b.querySelectorAll('[data-bal]')) {
            const raw = inp.value.trim();
            if (!raw) continue;
            const v = L.toCents(raw);
            if (Number.isNaN(v)) { b.querySelector('#ci-err').textContent = 'Type the balances as numbers.'; return; }
            balances[inp.dataset.bal] = v;
          }
          const entry = { ...(e || {}), kind: 'checkin', balances, amount: 0, note: '', date: e?.date || today(), ...(source ? { source } : {}) };
          sheet.close();
          changed(() => M.upsertEntry(entry), [entry.date]);
          const saved = M.getState().entries.find((x) => x.kind === 'checkin' && x.date === entry.date && (!e || x.id === e.id));
          if (saved) toast(upd ? 'Balances updated' : `Spent ${money(s, L.weekSpent(M.getState(), new Date(saved.at)))} this week`);
        }
        if (t.id === 'ci-del' && confirm('Delete this check-in?')) { sheet.close(); changed(() => M.deleteEntry(e.id), [e.date]); toast('Deleted'); }
      };
    },
  });
}

// The savings goal (name, target, which account counts)
function openGoal() {
  const s = M.getState();
  const g = s.settings.goal;
  let acct = g.account;
  sheet.open({
    title: 'Savings goal',
    body: `<label class="imp-field"><span class="imp-label">Saving for</span><input class="imp-input" id="g-name" maxlength="30" value="${esc(g.name)}"></label>
      <label class="imp-field"><span class="imp-label">Target</span><span class="food-unit"><input class="imp-input" id="g-target" inputmode="decimal" value="${g.target / 100}"><span>${esc(s.settings.currency)}</span></span></label>
      ${s.accounts?.length ? `<div class="imp-field"><span class="imp-label">Counts the money in</span><div class="mon-chips">${s.accounts.map((a) => `<button type="button" data-acct="${esc(a.id)}" class="mon-chip${acct === a.id ? ' is-on' : ''}">${icon(a.icon || 'cash')}${esc(a.name)}</button>`).join('')}</div></div>` : ''}
      <button class="imp-btn imp-btn--primary imp-btn--block" id="g-save">Save</button>`,
    onMount(b) {
      b.onclick = (ev) => {
        const t = ev.target.closest('button');
        if (!t) return;
        if (t.dataset.acct) { acct = t.dataset.acct; b.querySelectorAll('.mon-chip').forEach((x) => x.classList.toggle('is-on', x === t)); return; }
        if (t.id !== 'g-save') return;
        const target = L.toCents(b.querySelector('#g-target').value);
        if (!(target > 0)) return toast('Enter a target above 0');
        M.saveSettings({ goal: { name: b.querySelector('#g-name').value.trim() || 'Goal', target, account: acct } });
        sheet.close(); rerender(); toast('Goal saved');
      };
    },
  });
}

// All accounts right after a check-in (an account left blank keeps what it had)
function checkinTotal(s, e) {
  const before = L.balances(s, e);
  return (s.accounts || []).reduce((t, a) => t + (a.id in (e.balances || {}) ? e.balances[a.id] : before[a.id] || 0), 0);
}

// History: everything logged this month, newest first, with the time it was logged
function history(s) {
  const [start, end] = L.monthRange(ui.month);
  const list = L.inRange(s.entries, start, end).sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
  const cat = (id) => (s.categories || []).find((c) => c.id === id);
  const days = [...new Set(list.map((e) => e.date))];
  const rows = days.map((d) => `<div class="mon-day">${d === today() ? 'Today' : shortDate(d)}</div>` + list.filter((e) => e.date === d).map((e) => {
    const c = e.kind === 'expense' ? cat(e.cat) : null;
    if (e.kind === 'checkin' && e.source) {
      const label = { setup: 'Starting balances', payday: 'Spend balance (payday)', update: 'Balances updated' }[e.source] || 'Balances';
      return `<button class="mon-row" data-m="edit" data-id="${e.id}">${icon('bank', 'mon-row__icon mon-k-checkin')}
        <span class="mon-row__mid"><span class="mon-row__name">${label}</span><span class="mon-row__sub">${esc(Object.entries(e.balances || {}).map(([id, v]) => `${acctName(s, id)} ${money(s, v)}`).join(' · '))}</span></span></button>`;
    }
    if (e.kind === 'checkin') {
      const r = L.checkinResult(s, e);
      const sav = r.change.savings;
      return `<button class="mon-row" data-m="edit" data-id="${e.id}">${icon('check', 'mon-row__icon mon-k-checkin')}
        <span class="mon-row__mid"><span class="mon-row__name">Check-in</span><span class="mon-row__sub">${esc([`Spent ${money(s, r.spent)}`, sav != null ? `Savings ${sav >= 0 ? '+' : '−'}${money(s, Math.abs(sav))}` : '', r.extra ? `Extra +${money(s, r.extra)}` : ''].filter(Boolean).join(' · '))}</span></span>
        <span class="mon-row__amt">${money(s, checkinTotal(s, e))}</span></button>`;
    }
    const ic = { income: 'bank', saving: 'piggy', transfer: 'bank', adjust: 'scroll', cashback: 'star' }[e.kind] || c?.icon || 'cash';
    const title = e.payday ? 'Payday' : e.kind === 'adjust' ? 'Balance fix' : e.kind === 'transfer' ? e.note || `${acctName(s, e.from)} → ${acctName(s, e.to)}` : e.note || (e.kind === 'expense' ? c?.name || 'Expense' : KIND[e.kind]);
    const what = e.kind === 'adjust' ? `Matched ${acctName(s, e.account)} to bank` : e.kind === 'transfer' ? 'Moved money' : e.kind === 'cashback' ? `Into ${acctName(s, e.account || 'savings')}`
      : L.beforeTracking(s, e) ? 'Before tracking' : e.kind === 'expense' ? (e.note ? c?.name || 'Other' : '')
      : e.kind === 'income' && e.splits?.length > 1 ? e.splits.map((x) => `${acctName(s, x.account)} ${money(s, x.amount)}`).join(' · ') : e.note ? KIND[e.kind] : '';
    const time = e.at && dayKey(new Date(e.at)) === e.date ? timeOf(e.at) : '';
    const sub = [time, what].filter(Boolean).join(' · ');
    return `<button class="mon-row" data-m="edit" data-id="${e.id}">${icon(ic, `mon-row__icon mon-k-${e.kind}`)}
      <span class="mon-row__mid"><span class="mon-row__name">${esc(title)}</span>${sub ? `<span class="mon-row__sub">${esc(sub)}</span>` : ''}</span>
      <span class="mon-row__amt mon-k-${e.kind}">${e.kind === 'expense' || e.kind === 'transfer' || e.amount < 0 ? '' : '+'}${money(s, e.amount)}</span></button>`;
  }).join('')).join('');
  return box('History', `${monthNav()}${rows || '<p class="mon-empty">Nothing logged this month.</p>'}`);
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
    ${cashbackBox(s)}
    ${box('Other', `<div class="mon-stack">
      <label class="imp-field"><span class="imp-label">Currency symbol</span><input class="imp-input" id="s-cur" maxlength="3" value="${esc(s.settings.currency)}"></label>
      <p class="food-err" id="s-err"></p>
      <button class="imp-btn imp-btn--primary imp-btn--block" data-m="save-settings">Save settings</button>
      <p class="mon-note">Money is included in the backup on the You page.</p></div>`)}`;
}

// Card cash back: % of spending, and the account it's paid into
function cashbackBox(s) {
  const cb = s.settings.cashback || {};
  const acct = ui.cbAcct || cb.account || 'savings';
  const accts = s.accounts || [];
  return box('Cash back', `<div class="mon-stack">
    <p class="mon-note">If your card pays cash back, set the rate. Money shows about how much you've earned this month, and you log the deposit when the bank pays it.</p>
    <label class="imp-field"><span class="imp-label">Rate (blank = off)</span><span class="food-unit"><input class="imp-input" id="cb-rate" inputmode="decimal" placeholder="0" value="${cb.rate || ''}"><span>%</span></span></label>
    ${accts.length ? `<div class="imp-field"><span class="imp-label">Paid into</span><div class="mon-chips">${accts.map((a) => `<button type="button" data-m="cb-acct" data-id="${esc(a.id)}" class="mon-chip${acct === a.id ? ' is-on' : ''}">${icon(a.icon || 'cash')}${esc(a.name)}</button>`).join('')}</div></div>` : ''}
  </div>`);
}

// ---------- Payday ----------
// Each Friday: type the paycheck and the Spend (checking) balance; Improve says how much goes where in Greenlight.
const thisWeekPaydays = (s) => { const [a, b] = periodRange('weekly'); return L.paydays(s).filter((e) => e.date >= a && e.date <= b); };

// What's typed on the Payday page (kept across re-renders), with the defaults filled in
function paydayInputs(s) {
  const pd = s.settings.payday;
  const done = thisWeekPaydays(s).pop(); // already marked this week: show what was logged
  const amtRaw = ui.pd?.['pd-amt'] ?? String((done ? done.amount : pd.last) / 100);
  const balRaw = ui.pd?.['pd-bal'] ?? String((done ? done.payday.balance : L.balances(s).checking ?? 0) / 100);
  return { amtRaw, balRaw, amount: L.toCents(amtRaw || '0'), bal: L.toCents(balRaw || '0') };
}

function paydayResult(s) {
  const { amount, bal } = paydayInputs(s);
  if (!(amount > 0) || Number.isNaN(bal)) return null;
  const r = L.paydaySplit(amount, bal, s.settings.payday);
  const inv = L.investingId(s);
  return { amount, bal, r, inv, capped: r.checking < Math.round((amount * s.settings.payday.pct.checking) / 100) };
}

function paydayCards(s) {
  const x = paydayResult(s);
  if (!x) return '<p class="mon-empty">Type your paycheck and Spend balance.</p>';
  const bal = L.balances(s);
  const done = !!thisWeekPaydays(s).length && !ui.pd;
  const card = (id, kind, amt, after) => `<div class="mon-pdcard mon-pdcard--${kind}"><span class="mon-pdcard__name">${esc(acctName(s, id))}</span>
    <b class="mon-pdcard__amt${money(s, amt).length > 7 ? ' is-long' : ''}">${money(s, amt)}</b>${done ? '' : `<span class="mon-pdcard__after">→ ${money(s, after)}</span>`}</div>`;
  const invBal = x.inv ? bal[x.inv] ?? 0 : 0;
  const savAmt = x.r.savings + (x.inv ? 0 : x.r.investing);
  const cards = card('checking', 'chk', x.r.checking, x.bal + x.r.checking) + card('savings', 'sav', savAmt, (bal.savings ?? 0) + savAmt)
    + (x.inv ? card(x.inv, 'inv', x.r.investing, invBal + x.r.investing) : '');
  const to = [`${money(s, savAmt)} to ${acctName(s, 'savings')}`, x.inv ? `${money(s, x.r.investing)} to ${acctName(s, x.inv)}` : ''].filter(Boolean).join(' and ');
  const line = `${x.r.checking ? `Keep ${money(s, x.r.checking)} in ${acctName(s, 'checking')}, move` : 'Move'} ${to}.`;
  const cap = x.capped ? ` ${acctName(s, 'checking')} is capped at ${money(s, s.settings.payday.cap)}, so the rest goes to ${acctName(s, 'savings')}${x.inv ? ` and ${acctName(s, x.inv)}` : ''}.` : '';
  return `<div class="mon-pdcards">${cards}</div><p class="mon-pdline">${esc(line + cap)}</p>`;
}

function paydayTotalsBox(s) {
  const x = paydayResult(s);
  const t = L.paydayTotals(s, x?.r);
  const inv = L.investingId(s);
  return box('Totals', `<div class="mon-pdtot">
      <div><span>Total saved</span><b>${money(s, t.saved)}</b></div>
      ${inv ? `<div><span>Total invested</span><b>${money(s, t.invested)}</b></div>` : ''}
    </div>
    <p class="imp-label mon-pdtot__h">A year from now at this pace</p>
    <div class="mon-pdtot">
      <div><span>${esc(acctName(s, 'savings'))}</span><b>${money(s, t.yearSavings)}</b></div>
      ${inv ? `<div><span>${esc(acctName(s, inv))}</span><b>${money(s, t.yearInvesting)}</b></div>` : ''}
    </div>
    <p class="mon-note">${t.fromPreview ? 'Pace = this paycheck\'s split, every Friday. Your logged paydays take over once you mark one done.' : `Pace = your last ${Math.min(4, t.paydays)} payday${Math.min(4, t.paydays) === 1 ? '' : 's'} (${money(s, t.pace.savings)} saved${inv ? ` · ${money(s, t.pace.investing)} invested` : ''} each), every Friday for 52 weeks.`}</p>`);
}

function paydayHistory(s) {
  const list = L.paydays(s).reverse();
  const rows = list.map((e) => `<button class="mon-row" data-m="edit" data-id="${e.id}">${icon('cash', 'mon-row__icon mon-k-income')}
      <span class="mon-row__mid"><span class="mon-row__name">${shortDate(e.date)} · ${money(s, e.amount)}</span><span class="mon-row__sub">${esc(e.splits.map((x) => `${acctName(s, x.account)} ${money(s, x.amount)}`).join(' · '))}</span></span></button>`).join('');
  return box('Paydays', rows || '<p class="mon-empty">No paydays yet. Mark one done above.</p>', list.length ? `${list.length}` : '');
}

function paydaySettingsBox(s) {
  const pd = s.settings.payday;
  const inv = L.investingId(s);
  const field = (id, label, v, unit) => `<label class="imp-field"><span class="imp-label">${esc(label)}</span><span class="food-unit"><input class="imp-input" id="${id}" inputmode="decimal" value="${v}"><span>${unit}</span></span></label>`;
  return box('Split settings', `<div class="mon-stack">
    <div class="mon-pdset">${field('ps-chk', acctName(s, 'checking'), pd.pct.checking, '%')}${field('ps-sav', acctName(s, 'savings'), pd.pct.savings, '%')}${inv ? field('ps-inv', acctName(s, inv), pd.pct.investing, '%') : ''}</div>
    ${field('ps-cap', `${acctName(s, 'checking')} cap`, pd.cap / 100, esc(s.settings.currency))}
    <p class="mon-note">The %s must add up to 100. ${esc(acctName(s, 'checking'))} never goes over the cap; what it can't take goes to the others in their own ratio.</p>
    <p class="food-err" id="ps-err"></p>
    <button class="imp-btn imp-btn--secondary imp-btn--block" data-m="payday-save">Save split</button></div>`);
}

function paydayPage(s) {
  const { amtRaw, balRaw } = paydayInputs(s);
  const done = thisWeekPaydays(s).pop();
  return `${box('This paycheck', `<div class="mon-stack">
      <div class="imp-field-row">
        <label class="imp-field"><span class="imp-label">Paycheck</span><span class="food-unit"><input class="imp-input mon-amt" id="pd-amt" inputmode="decimal" value="${esc(amtRaw)}" autocomplete="off"><span>${esc(s.settings.currency)}</span></span></label>
        <label class="imp-field"><span class="imp-label">${esc(acctName(s, 'checking'))} balance now</span><span class="food-unit"><input class="imp-input mon-amt" id="pd-bal" inputmode="decimal" value="${esc(balRaw)}" autocomplete="off"><span>${esc(s.settings.currency)}</span></span></label>
      </div>
      <p class="mon-note">${done && !ui.pd ? 'This week\'s payday, as you logged it.' : 'Filled in from Improve. Change the balance to what Greenlight shows if you\'ve spent since.'}</p>
      <div id="pd-out">${paydayCards(s)}</div>
      <p class="food-err" id="pd-err"></p>
      ${done && !ui.pd ? `<div class="mon-pddone"><span class="mon-done">${icon('check')}Marked done ${shortDate(done.date)}</span><button class="mon-link" data-m="edit" data-id="${done.id}">Undo</button></div>`
        : `<button class="imp-btn imp-btn--primary imp-btn--block" data-m="payday-done">${icon('check')}Mark as done</button>`}</div>`)}
    <div id="pd-tot">${paydayTotalsBox(s)}</div>
    ${paydayHistory(s)}
    ${paydaySettingsBox(s)}`;
}

// Typing: redraw the cards and totals only (keeps the keyboard up)
function updatePayday() {
  const s = M.getState();
  const out = ctx.root.querySelector('#pd-out');
  if (out) out.innerHTML = paydayCards(s);
  const tot = ctx.root.querySelector('#pd-tot');
  if (tot) tot.innerHTML = paydayTotalsBox(s);
}

function markPayday() {
  const s = M.getState();
  const err = ctx.root.querySelector('#pd-err');
  const { amount, bal } = paydayInputs(s);
  if (!(amount > 0)) { err.textContent = 'Enter the paycheck amount.'; return; }
  if (Number.isNaN(bal)) { err.textContent = 'Enter the balance as a number.'; return; }
  const r = L.paydaySplit(amount, bal, s.settings.payday);
  const splits = L.paydaySplits(s, r);
  const now = Date.now();
  const id = now.toString(36) + Math.random().toString(36).slice(2, 7);
  const cur = L.balances(s).checking ?? 0;
  changed(() => {
    // The balance you typed is the real one: record it first (spending since the last update), then the paycheck
    let checkinId = null;
    if (bal !== cur) {
      checkinId = id + 'b';
      M.upsertEntry({ id: checkinId, kind: 'checkin', source: 'payday', balances: { checking: bal }, amount: 0, note: '', date: today(), at: new Date(now).toISOString() });
    }
    M.upsertEntry({ id, kind: 'income', amount, note: 'Paycheck', date: today(), at: new Date(now + 1).toISOString(), splits, payday: { balance: bal, checkinId } });
    M.saveSettings({ payday: { ...s.settings.payday, last: amount } });
  }, [today()]);
  ui.pd = null;
  rerender();
  toast('Payday logged');
}

function undoPayday(e) {
  const s = M.getState();
  if (!confirm(`Undo the ${shortDate(e.date)} payday (${money(s, e.amount)})? Its amounts come back off your balances.`)) return;
  changed(() => {
    M.deleteEntry(e.id);
    if (e.payday?.checkinId) M.deleteEntry(e.payday.checkinId);
  }, [e.date]);
  toast('Payday undone');
}

function savePaydaySettings() {
  const s = M.getState();
  const err = ctx.root.querySelector('#ps-err');
  const num = (id) => { const v = ctx.root.querySelector(id)?.value.trim(); return v == null ? 0 : Number(v); };
  const pct = { checking: num('#ps-chk'), savings: num('#ps-sav'), investing: L.investingId(s) ? num('#ps-inv') : 0 };
  if (Object.values(pct).some((v) => !Number.isFinite(v) || v < 0)) { err.textContent = 'Use numbers 0–100.'; return; }
  const sum = pct.checking + pct.savings + pct.investing;
  if (Math.abs(sum - 100) > 0.001) { err.textContent = `They add up to ${sum}%. Make it 100%.`; return; }
  const cap = L.toCents(ctx.root.querySelector('#ps-cap').value || '0');
  if (Number.isNaN(cap) || cap < 0) { err.textContent = 'Enter the cap as a number.'; return; }
  M.saveSettings({ payday: { ...s.settings.payday, pct, cap } });
  rerender();
  toast('Split saved');
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
  const kinds = Object.entries(KIND).filter(([id]) => (id !== 'expense' || cur.kind === 'expense') && (id !== 'transfer' || accts.length) && (id !== 'saving' || !accts.length || cur.kind === 'saving'));
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
    if (ui.page === 'payday' && (t.id === 'pd-amt' || t.id === 'pd-bal')) {
      const first = !ui.pd;
      ui.pd = { ...(ui.pd || {}), [t.id]: t.value };
      if (first && thisWeekPaydays(M.getState()).length) { rerender(); const el = ctx.root.querySelector('#' + t.id); el?.focus(); el?.setSelectionRange?.(el.value.length, el.value.length); } // another paycheck this week
      else updatePayday();
    }
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
        if (entry?.payday) undoPayday(entry);
        else if (entry?.kind === 'cashback') openCashback(entry);
        else if (entry?.kind === 'checkin') openCheckin(entry);
        else if (entry?.kind === 'adjust') {
          if (confirm(`Remove this ${money(s, entry.amount)} balance fix?`)) { M.deleteEntry(entry.id); rerender(); toast('Removed'); }
        } else openEntry(null, entry);
        break;
      }
      case 'acct-setup': openAccountSetup(); break;
      case 'cashback': openCashback(); break;
      case 'checkin': openCheckin(); break;
      case 'update-bal': openCheckin(null, 'update'); break;
      case 'payday-done': markPayday(); break;
      case 'payday-save': savePaydaySettings(); break;
      case 'goal': openGoal(); break;
      case 'acct': openAccount(el.dataset.id); break;
      case 'acct-add': openAddAccount(); break;

      case 'freq': keepTyped(); ui.payFreq = el.dataset.freq; rerender(); break;
      case 'cb-acct': keepTyped(); ui.cbAcct = el.dataset.id; rerender(); break;
      case 'save-settings': saveSettings(s); break;
    }
  });
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
  const currency = ctx.root.querySelector('#s-cur').value.trim() || '$';
  const rateRaw = ctx.root.querySelector('#cb-rate')?.value.trim() || '';
  const rate = rateRaw ? Number(rateRaw) : 0;
  if (!(rate >= 0 && rate <= 20)) { err.textContent = 'Cash back rate must be 0–20%.'; return; }
  const cashback = { rate, account: ui.cbAcct || s.settings.cashback?.account || 'savings' };
  ui.cbAcct = null;
  ui.payFreq = null;
  ui.typed = null;
  ui.page = null;
  changed(() => M.saveSettings({ pay, currency, cashback, setup: true }));
  window.scrollTo(0, 0);
  toast('Settings saved');
}

export const recheck = () => recheckMoney();

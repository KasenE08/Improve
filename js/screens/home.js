// Home: the one screen. The header (week circles) sits above; each card shows an area at a glance
// and opens its full page. Small actions (tick a habit, add water) work right here.
import * as H from '../habits.js';
import * as R from '../rewards.js';
import * as Stats from '../stats.js';
import * as store from '../store.js';
import * as Food from '../food/store.js';
import * as FoodAuto from '../food/autocheck.js';
import * as Money from '../money/store.js';
import * as ML from '../money/logic.js';
import * as Journal from '../journal/store.js';
import { totals } from '../food/logic.js';
import { dayKey, appNow } from '../dates.js';
import { isAuto } from '../auto.js';
import { esc, icon, check, xpbar, pct, toast } from '../ui.js';
import { dayStatus } from '../hud.js';
import { celebrate } from './today.js';

let ctx; // { root, refresh }

const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').replace(':00', '').toLowerCase();
const fmtDue = (ms) => {
  const d = new Date(ms);
  const today = dayKey();
  const k = dayKey(appNow(d));
  const day = k === today ? 'today' : d.toLocaleDateString('en-US', { weekday: 'short' });
  return `due ${day} ${fmtTime(ms)}`;
};
const card = (go, title, ic, more, body, cls = '') => `<div class="hcard ${cls}" data-go="${go}">
    <div class="hcard__head"><span class="hcard__title">${icon(ic)}${esc(title)}</span><span class="hcard__more">${more}${icon('next')}</span></div>${body}</div>`;

// Next assignments from the planner's saved plan
function upNext() {
  const data = store.get('planner', null);
  if (!data) return null;
  const tasks = new Map((data.tasks || []).map((t) => [t.id, t]));
  const now = Date.now();
  const items = (data.plan?.items || [])
    .filter((i) => tasks.get(i.taskId) && tasks.get(i.taskId).status !== 'done' && i.end > now)
    .sort((a, b) => a.start - b.start);
  return { items, tasks, open: (data.tasks || []).filter((t) => t.status !== 'done').length };
}

export function render(root, refresh) {
  ctx = { root, refresh };
  const today = dayKey();

  // Habits
  const st = dayStatus(today);
  const next = st ? st.items.filter((i) => !i.done && !i.off && !isAuto(i.h) && !H.isLimit(i.h) && !H.notStarted(i.h)).slice(0, 4) : [];
  const left = st ? st.total - st.done : 0;
  const ring = st && st.total ? Math.round((st.done / st.total) * 100) : 0;
  const habits = card('today', 'Habits', 'today', 'All',
    `<div class="hcard__row"><div class="hring${st?.perfect ? ' is-perfect' : ''}" style="--p:${ring}"><span>${st ? `${st.done}/${st.total}` : '–'}</span></div>
      <div><div class="hcard__big hcard__big--sm">${st?.perfect ? 'Perfect Day' : left ? `${left} left today` : 'All done'}</div>
      <div class="hcard__sub">${next.length ? 'Up next, tap to tick:' : st?.perfect ? 'Every daily habit done' : 'The rest tick on their own'}</div></div></div>
    ${next.length ? `<div class="hq">${next.map((i) => `<button class="hq__row" data-tick="${esc(i.h.id)}">${check(false, i.h.target > 1 && i.n ? i.n : '')}<span>${esc(i.h.name)}${i.h.target > 1 ? ` <small>${i.n}/${i.h.target}</small>` : ''}</span></button>`).join('')}</div>` : ''}`);

  // Up next (Planner)
  const un = upNext();
  let planBody;
  if (!un) planBody = '<p class="hcard__sub">Open to set up your schedule.</p>';
  else if (!un.items.length) planBody = `<p class="hcard__sub">${un.open ? 'Nothing else planned today.' : 'No assignments. Nice.'}</p>`;
  else {
    const [first, ...rest] = un.items;
    const t = un.tasks.get(first.taskId);
    const mins = Math.round((first.end - first.start) / 60000);
    planBody = `<div class="next${first.late ? ' is-late' : ''}"><span class="next__bar"></span><div><div class="next__title">${esc(t.title)}</div><div class="hcard__sub">${t.due ? fmtDue(t.due) : 'missing work'}${first.late ? ' · late' : ''}</div></div>
      <div class="next__time"><b>${fmtTime(first.start)}</b>${mins} min</div></div>
      ${rest.length ? `<div class="chips">${rest.slice(0, 1).map((i) => `<span>${dayKey(appNow(new Date(i.start))) === today ? '' : new Date(i.start).toLocaleDateString('en-US', { weekday: 'short' }) + ' '}${fmtTime(i.start)} · ${esc(un.tasks.get(i.taskId).title)}</span>`).join('')}${rest.length > 1 ? `<span>${rest.length - 1} more</span>` : ''}</div>` : ''}`;
  }
  const plan = card('planner', 'Up next', 'planner', 'Plan', planBody);

  // Food + water
  const g = Food.getGoals();
  const t = totals(Food.entriesFor(today));
  const calLeft = Math.round(g.calGoal - t.cal);
  const water = Food.waterFor(today);
  const food = card('food', 'Food', 'food', '',
    `<div class="hcard__big${calLeft < 0 ? ' is-over' : ''}">${Math.abs(calLeft).toLocaleString()}<small>cal ${calLeft < 0 ? 'over' : 'left'}</small></div>
     <div class="mini"><div class="mini__top"><span>Protein</span><b>${Math.round(t.protein)}/${g.proteinGoal} g</b></div>${xpbar(pct(t.protein, g.proteinGoal), 'imp-xpbar--sm imp-xpbar--protein')}</div>`);
  const waterCard = card('food', 'Water', 'skin', '',
    `<div class="hcard__big">${water}<small>/ ${g.waterGoal} oz</small></div>
     <div class="chips"><button class="chip-btn is-water" data-water="8">+8</button><button class="chip-btn is-water" data-water="16">+16</button></div>`, 'hcard--water');

  // Money
  const ms = Money.getState();
  const cur = ms.settings?.currency || '$';
  const mk = today.slice(0, 7);
  const sum = ML.monthSummary(ms, mk);
  const bal = ML.balances(ms);
  const accts = (ms.accounts || []).slice(0, 2).map((a) => `<span>${esc(a.name)} ${ML.fmtMoney(bal[a.id] || 0, cur)}</span>`).join('');
  const money = card('money', 'Money', 'wallet', new Date().toLocaleDateString('en-US', { month: 'long' }),
    `<div class="hcard__big${sum.budget && sum.spent > sum.budget ? ' is-over' : ''}">${ML.fmtMoney(sum.spent, cur)}<small>${sum.budget ? `of ${ML.fmtMoney(sum.budget, cur)} spent` : 'spent'}</small></div>
     ${sum.budget ? xpbar(Math.min(100, pct(sum.spent, sum.budget)), `imp-xpbar--sm${sum.spent > sum.budget ? ' imp-xpbar--over' : ''}`) : ''}
     ${accts ? `<div class="chips">${accts}</div>` : ''}`);

  // Journal
  const words = Journal.wordCount(Journal.getDay(today));
  const min = Journal.getJournal().settings.minWords;
  const journal = card('journal', 'Journal', 'quill', `${words} / ${min} words`,
    `<div class="jprompt${words ? ' is-on' : ''}">${words ? esc(Journal.getDay(today).trim().slice(0, 90)) + (Journal.getDay(today).trim().length > 90 ? '…' : '') : 'How did today go?'}</div>`);

  root.innerHTML = `<div class="screen home">${habits}${plan}<div class="tiles">${food}${waterCard}</div>${money}${journal}</div>`;
}

export function bind(root) {
  root.addEventListener('click', (e) => {
    if (root.dataset.tab !== 'home') return;
    const tick = e.target.closest('[data-tick]');
    if (tick) {
      const h = H.getHabits().find((x) => x.id === tick.dataset.tick);
      if (!h) return;
      const before = Stats.compute();
      H.step(h, +1);
      const added = R.sync();
      ctx.refresh();
      return celebrate(before, Stats.compute(), added);
    }
    const w = e.target.closest('[data-water]');
    if (w) {
      const oz = Number(w.dataset.water);
      const before = Stats.compute();
      Food.addWater(dayKey(), oz);
      const added = FoodAuto.recheck(dayKey());
      ctx.refresh();
      toast(`+${oz} oz water`);
      return celebrate(before, Stats.compute(), added);
    }
    const go = e.target.closest('[data-go]');
    if (go) location.hash = go.dataset.go;
  });
}

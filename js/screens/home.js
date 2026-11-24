// Home: the one screen. The header (week circles) sits above; each card shows an area at a glance
// and opens its full page. Small actions (tick a habit, add water) work right here.
import * as H from '../habits.js';
import * as R from '../rewards.js';
import * as Stats from '../stats.js';
import * as Food from '../food/store.js';
import * as FoodAuto from '../food/autocheck.js';
import * as Money from '../money/store.js';
import * as ML from '../money/logic.js';
import * as Journal from '../journal/store.js';
import { totals } from '../food/logic.js';
import { dayKey } from '../dates.js';
import { isAuto } from '../auto.js';
import { esc, icon, check, xpbar, pct, toast, waterWin, tickReward } from '../ui.js';
import { dayStatus } from '../hud.js';
import { celebrate } from './today.js';

let ctx; // { root, refresh }

const card = (go, title, ic, more, body, cls = '') => `<div class="hcard ${cls}" data-go="${go}">
    <div class="hcard__head"><span class="hcard__title">${icon(ic)}${esc(title)}</span><span class="hcard__more">${more}${icon('next')}</span></div>${body}</div>`;

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
      <div class="hcard__sub">${next.length ? 'Up next · tap = Full, hold = 2-min:' : st?.perfect ? 'Every habit done Full' : left ? 'The rest tick on their own' : 'Some were 2-min: Full for a Perfect Day'}</div></div></div>
    ${next.length ? `<div class="hq">${next.map((i) => `<button class="hq__row" data-tick="${esc(i.h.id)}">${check(false)}<span>${esc(i.h.name)}${i.h.target > 1 ? ` <small>${i.n}/${i.h.target}</small>` : ''}</span></button>`).join('')}</div>` : ''}`);


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
     ${g.lastWaterOz ? `<div class="chips"><button class="chip-btn is-water" data-water="${g.lastWaterOz}">+${g.lastWaterOz} oz</button></div>` : '<p class="hcard__sub">Tap to log water</p>'}`, 'hcard--water');

  // Money: the savings goal bar, and last week's check-in
  const ms = Money.getState();
  const cur = ms.settings?.currency || '$';
  const goal = ms.settings.goal;
  const have = ML.balances(ms)[goal.account] ?? 0;
  const last = ML.lastCheckin(ms);
  const doneWeek = ML.checkedInWeek(ms);
  const chip = last ? `<span>Spent ${ML.fmtMoney(ML.weekSpent(ms, new Date(last.at)), cur)} last check-in week</span>` : '';
  const money = card('money', goal.name, 'star', doneWeek ? 'Checked in' : 'Check in Sunday',
    `<div class="hcard__big">${ML.fmtMoney(have, cur)}<small>of ${ML.fmtMoney(goal.target, cur)}</small></div>
     ${xpbar(Math.min(100, pct(have, goal.target)), 'imp-xpbar--sm')}
     ${chip ? `<div class="chips">${chip}</div>` : ''}`);

  // Journal
  const words = Journal.wordCount(Journal.getDay(today));
  const min = Journal.getJournal().settings.minWords;
  const journal = card('journal', 'Journal', 'quill', `${words} / ${min} words`,
    `<div class="jprompt${words ? ' is-on' : ''}">${words ? esc(Journal.getDay(today).trim().slice(0, 90)) + (Journal.getDay(today).trim().length > 90 ? '…' : '') : 'How did today go?'}</div>`);

  root.innerHTML = `<div class="screen home">${habits}<div class="tiles">${food}${waterCard}</div>${money}${journal}</div>`;
}

// Up next: tap = Full, hold = the 2-minute version
async function tickHome(h, row, level = H.FULL) {
  if (level === H.MIN && !H.hasMin(h)) return toast('Full only: no 2-min version');
  const before = Stats.compute();
  const r = row.querySelector('.imp-check')?.getBoundingClientRect();
  H.setLevel(h, dayKey(), level);
  const added = R.sync();
  ctx.refresh();
  if (r) { const ghost = document.createElement('span'); ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none`; document.body.appendChild(ghost); tickReward(ghost, level); setTimeout(() => ghost.remove(), 1600); }
  celebrate(before, Stats.compute(), added);
}

let holdT = null, holdDone = false;
export function bind(root) {
  root.addEventListener('pointerdown', (e) => {
    const tick = root.dataset.tab === 'home' && e.target.closest('[data-tick]');
    holdDone = false;
    clearTimeout(holdT);
    if (!tick) return;
    holdT = setTimeout(() => {
      holdDone = true;
      navigator.vibrate?.(10);
      const h = H.getHabits().find((x) => x.id === tick.dataset.tick);
      if (h) tickHome(h, tick, H.MIN);
    }, 450);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(ev, () => clearTimeout(holdT));
  root.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-tick]')) e.preventDefault(); });
  root.addEventListener('click', (e) => {
    if (root.dataset.tab !== 'home') return;
    const tick = e.target.closest('[data-tick]');
    if (tick && holdDone) { holdDone = false; return; }
    if (tick) {
      const h = H.getHabits().find((x) => x.id === tick.dataset.tick);
      if (!h) return;
      tickHome(h, tick);
      return;
    }
    const w = e.target.closest('[data-water]');
    if (w) {
      const oz = Number(w.dataset.water);
      const before = Stats.compute();
      const oz0 = Food.waterFor(dayKey());
      Food.addWater(dayKey(), oz);
      const added = FoodAuto.recheck(dayKey());
      ctx.refresh();
      if (!waterWin(oz0, Food.waterFor(dayKey()), Food.getGoals().waterGoal)) toast(`+${oz} oz water`);
      return celebrate(before, Stats.compute(), added);
    }
    const go = e.target.closest('[data-go]');
    if (go) location.hash = go.dataset.go;
  });
}

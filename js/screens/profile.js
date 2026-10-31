// Profile tab: name, streaks, backup, credits. (Ranks editor kept but not shown while levels are hidden.)
import * as H from '../habits.js';
import * as R from '../rewards.js';
import * as Stats from '../stats.js';
import * as Backup from '../backup.js';
import * as store from '../store.js';
import { dayKey, appNow } from '../dates.js';
import { getRanks, saveRanks, DEFAULT_RANKS } from '../levels.js';
import { esc, icon, panel, streakTag, sheet, toast } from '../ui.js';

const fmt = (n) => Math.floor(n).toLocaleString('en-US');

export function render(root) {
  const p = H.getProfile();
  const st = Stats.compute();
  const streaks = R.allStreaks();
  const last = Backup.lastBackup();
  const daysSince = last ? Math.floor((Date.now() - new Date(last)) / 86400000) : null;

  const streakList = streaks.length
    ? streaks.slice(0, 10).map((s) => `<div class="prof-streak"><span>${esc(s.h.name)}</span>${streakTag(s.count, s.current, R.UNIT[s.h.frequency][s.count === 1 ? 0 : 1])}</div>`).join('')
    : `<p class="imp-muted prof-note">Complete a habit in back-to-back periods to start a streak.</p>`;

  const lastTxt = last ? (daysSince ? `${daysSince} day${daysSince === 1 ? '' : 's'} ago` : 'today') : 'never';
  const row = (act, ic, title, sub) => `<button class="g-row" data-act="${act}"><span class="g-icon">${icon(ic)}</span><span class="g-main"><span class="g-title">${title}</span>${sub ? `<span class="g-sub">${sub}</span>` : ''}</span>${icon('next', 'prof-go')}</button>`;
  root.innerHTML = `<div class="screen">
    <section class="imp-panel"><div class="imp-panel__body">
      <button class="prof-me" data-act="edit-name" aria-label="Rename"><span class="prof-avatar">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>
        <span class="prof-me__name">${esc(p.name)}</span>${icon('edit', 'prof-go')}</button>
      <div class="prof-totals">
        <div><b>${fmt(st.perfectDays)}</b><span>Perfect days</span></div>
        <div><b>${fmt(st.checkins)}</b><span>Check-ins</span></div>
        <div><b>${fmt(streaks.length)}</b><span>Streaks</span></div>
      </div>
    </div></section>
    ${streaks.length ? panel({ title: 'Streaks', body: streakList }) : ''}
    ${plannerStats()}
    <section class="imp-panel"><header class="imp-panel__head"><h2 class="imp-panel__title">Backup</h2><span class="imp-panel__meta ${daysSince == null || daysSince > 7 ? 'prof-warn' : ''}">Last: ${lastTxt}</span></header>
      <div class="imp-panel__body"><div class="group prof-group">
        ${row('export', 'scroll', 'Export backup', 'Save a file to Files or iCloud')}
        ${row('import', 'bank', 'Import', 'Replaces everything with a backup')}
      </div><input type="file" id="importFile" accept="application/json,.json" hidden></div></section>
    <p class="prof-foot">Everything stays on this phone (keys start with imp_). Nothing is sent anywhere.<br>
      Icons by <a href="https://lucide.dev" target="_blank" rel="noopener">Lucide</a> (ISC). Font: <a href="https://rsms.me/inter/" target="_blank" rel="noopener">Inter</a> (SIL OFL).</p>
  </div>`;
}

export function bind(root, refresh) {
  root.addEventListener('click', async (e) => {
    if (root.dataset.tab !== 'profile') return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'edit-name') openNameSheet(refresh);
    if (act === 'edit-ranks') openRanks(refresh);
    if (act === 'export') {
      try {
        if (await Backup.exportBackup()) { toast('Backup saved'); refresh(); }
      } catch (err) {
        console.warn(err);
        toast('Export failed');
      }
    }
    if (act === 'import') root.querySelector('#importFile')?.click();
  });
  root.addEventListener('change', async (e) => {
    if (root.dataset.tab !== 'profile' || e.target.id !== 'importFile' || !e.target.files[0]) return;
    const text = await e.target.files[0].text();
    e.target.value = '';
    const res = Backup.parseBackup(text);
    if (!res.ok) return alert(res.error);
    const when = new Date(res.backup.exportedAt).toLocaleString();
    if (!confirm(`Replace ALL current Improve data with the backup from ${when}? This can't be undone.`)) return;
    Backup.restoreBackup(res.backup);
    location.reload();
  });
}

export function openNameSheet(refresh) {
  const p = H.getProfile();
  sheet.open({
    title: 'Your name',
    body: `<label class="imp-field"><span class="imp-label">Name</span><input class="imp-input" id="n-name" maxlength="16" value="${esc(p.name)}" autocomplete="off"></label>
      <button class="imp-btn imp-btn--primary imp-btn--block" id="n-save">Save</button>`,
    onMount(b) {
      b.onclick = (e) => {
        if (!e.target.closest('#n-save')) return;
        const name = b.querySelector('#n-name').value.trim() || 'PLAYER';
        H.saveProfile({ ...p, name });
        sheet.close();
        refresh();
        toast('Saved');
      };
    },
  });
}

function openRanks(refresh) {
  let list = getRanks().map((r) => ({ ...r }));
  const body = () => `
    <div class="rank-list">${list.map((r, i) => `
      <div class="rank-row">
        <label class="imp-field"><span class="imp-label">From LV</span><input class="imp-input" type="number" inputmode="numeric" min="1" max="999" data-min="${i}" value="${r.min}" ${i === 0 ? 'disabled' : ''}></label>
        <label class="imp-field"><span class="imp-label">Name</span><input class="imp-input" maxlength="20" data-name="${i}" value="${esc(r.name)}"></label>
        <button class="imp-btn imp-btn--sm imp-btn--ghost rank-del" data-del="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Delete rank">${icon('trash')}</button>
      </div>`).join('')}</div>
    <p class="imp-label">The first rank always starts at LV 1.</p>
    <button class="imp-btn imp-btn--secondary imp-btn--block" id="r-add">${icon('plus')}Add rank</button>
    <button class="imp-btn imp-btn--primary imp-btn--block" id="r-save">Save</button>
    <button class="imp-btn imp-btn--ghost imp-btn--block" id="r-reset">Reset to defaults</button>`;
  sheet.open({
    title: 'Ranks',
    body: body(),
    onMount(b) {
      const redraw = () => { b.innerHTML = body(); };
      b.oninput = (e) => {
        const t = e.target;
        if (t.dataset.name != null) list[+t.dataset.name].name = t.value;
        if (t.dataset.min != null) list[+t.dataset.min].min = parseInt(t.value, 10) || 1;
      };
      b.onclick = (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.del != null) { list.splice(+t.dataset.del, 1); return redraw(); }
        if (t.id === 'r-add') {
          const top = list.reduce((m, r) => Math.max(m, r.min), 1);
          list.push({ min: top + 10, name: 'New rank' });
          return redraw();
        }
        if (t.id === 'r-reset') { list = DEFAULT_RANKS.map((r) => ({ ...r })); return redraw(); }
        if (t.id === 'r-save') {
          const clean = list.map((r, i) => ({ min: i === 0 ? 1 : Math.max(2, Math.min(999, r.min)), name: r.name.trim() || 'Unnamed' }));
          const mins = clean.map((r) => r.min);
          if (new Set(mins).size !== mins.length) return toast('Two ranks share a level');
          saveRanks(clean);
          sheet.close();
          refresh();
          toast('Saved');
        }
      };
    },
  });
}

// Planner numbers (moved here from the planner's old Stats tab)
function plannerStats() {
  const d = store.get('planner', null);
  if (!d || !(d.tasks || []).length) return '';
  const day = (ms) => dayKey(appNow(new Date(ms)));
  const today = dayKey();
  const weekAgo = dayKey(appNow(new Date(Date.now() - 7 * 86400000)));
  const tasks = new Map(d.tasks.map((t) => [t.id, t]));
  const done = d.tasks.filter((t) => t.status === 'done');
  const inWeek = (ms) => day(ms) >= today && day(ms) < dayKey(appNow(new Date(Date.now() + 7 * 86400000)));
  const planned = (d.plan?.items || []).filter((i) => tasks.get(i.taskId)?.status !== 'done' && inWeek(i.start)).reduce((m, i) => m + (i.end - i.start) / 60000, 0);
  const tracked = (d.history || []).reduce((m, h) => m + h.actualMin, 0);
  const hrs = (m) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}h` : `${Math.round(m)}m`);
  const cells = [
    [done.length, 'Done'],
    [done.filter((t) => t.completedAt && day(t.completedAt) > weekAgo).length, 'This week'],
    [d.tasks.length - done.length, 'To do'],
    [hrs(planned), 'Next 7 days'],
    [hrs(tracked), 'Timed'],
    [(d.classes || []).length, 'Classes'],
  ];
  return panel({ title: 'Planner', meta: icon('planner'), body: `<div class="prof-totals">${cells.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>` });
}

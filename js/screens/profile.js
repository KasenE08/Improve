// Profile tab: character sheet, streaks, ranks, backup, credits.
import * as H from '../habits.js';
import * as R from '../rewards.js';
import * as Stats from '../stats.js';
import * as Backup from '../backup.js';
import { getRanks, saveRanks, DEFAULT_RANKS, xpToReach } from '../levels.js';
import { esc, icon, panel, lvl, xpbar, attrRow, streakTag, sheet, toast } from '../ui.js';

const fmt = (n) => Math.floor(n).toLocaleString('en-US');

export function render(root) {
  const p = H.getProfile();
  const st = Stats.compute();
  const o = st.overall;
  const streaks = R.allStreaks();
  const last = Backup.lastBackup();
  const daysSince = last ? Math.floor((Date.now() - new Date(last)) / 86400000) : null;

  const nextRank = st.next
    ? `<p class="prof-note">Next rank: <span class="imp-accent">${esc(st.next.name)}</span> at LV ${st.next.min} · ${fmt(Math.max(0, xpToReach(st.next.min) - st.total))} XP to go</p>`
    : `<p class="prof-note">Top rank reached.</p>`;

  const streakList = streaks.length
    ? streaks.slice(0, 10).map((s) => `<div class="prof-streak"><span>${esc(s.h.name)}</span>${streakTag(s.count, s.current, R.UNIT[s.h.frequency][s.count === 1 ? 0 : 1])}</div>`).join('')
    : `<p class="imp-muted prof-note">Complete a habit in back-to-back periods to start a streak.</p>`;

  const ladder = st.ranks.map((r) => `<div class="prof-rank${r.name === st.rank.name && r.min === st.rank.min ? ' is-current' : ''}${o.level >= r.min ? ' is-reached' : ''}">
      <span class="prof-rank__lv">LV ${r.min}</span><span>${esc(r.name)}</span></div>`).join('');

  root.innerHTML = `<div class="screen">
    ${panel({
      title: 'Player',
      body: `<div class="prof-player">${lvl(o.level)}
          <div class="prof-player__main">
            <div class="prof-player__top"><span class="imp-title">${esc(p.name)}</span>
              <button class="imp-btn imp-btn--secondary imp-btn--sm" data-act="edit-name">${icon('edit')}Rename</button></div>
            <p class="imp-accent prof-rankname">${esc(st.rank.name)}</p>
          </div></div>
        ${xpbar(o.pct)}
        <p class="prof-note">${fmt(o.into)} / ${fmt(o.need)} XP to LV ${o.level + 1}</p>
        ${nextRank}
        <div class="prof-totals">
          <div><b>${fmt(st.total)}</b><span>Total XP</span></div>
          <div><b>${fmt(st.perfectDays)}</b><span>Perfect days</span></div>
          <div><b>${fmt(st.checkins)}</b><span>Check-ins</span></div>
        </div>`,
    })}
    ${panel({ title: 'Attributes', meta: icon('trophy'), body: st.categories.map(attrRow).join('') })}
    ${panel({ title: 'Streaks', meta: icon('flame'), body: streakList })}
    ${panel({
      title: 'Bonus XP',
      body: `<div class="prof-bonus"><span>Perfect Day (all dailies)</span><span class="imp-accent">+${R.PERFECT_DAY_XP}</span></div>
        ${R.MILESTONES.map(([n, xp]) => `<div class="prof-bonus"><span>${n}-period streak</span><span class="imp-accent">+${xp}</span></div>`).join('')}
        <div class="prof-bonus"><span>Every 100 after that</span><span class="imp-accent">+${R.MILESTONES[2][1]}</span></div>
        <p class="prof-note">A period is a day, week or month depending on the habit. Missing one resets the streak; you never lose XP.</p>`,
    })}
    ${panel({
      title: 'Ranks',
      body: `${ladder}<div class="imp-btn-row prof-actions"><button class="imp-btn imp-btn--secondary imp-btn--sm" data-act="edit-ranks">${icon('edit')}Edit ranks</button></div>`,
    })}
    ${panel({
      title: 'Backup',
      meta: icon('scroll'),
      body: `<p class="prof-text">Last backup: <span class="${daysSince == null || daysSince > 7 ? 'prof-warn' : 'imp-accent'}">${last ? new Date(last).toLocaleDateString() + (daysSince ? ` (${daysSince}d ago)` : ' (today)') : 'never'}</span></p>
        <p class="prof-note">Export saves a file you can keep in Files or iCloud. Import replaces everything in Improve with that file.</p>
        <div class="imp-btn-row prof-actions">
          <button class="imp-btn imp-btn--primary" data-act="export">Export backup</button>
          <button class="imp-btn imp-btn--secondary" data-act="import">Import</button>
        </div>
        <input type="file" id="importFile" accept="application/json,.json" hidden>`,
    })}
    ${panel({
      title: 'Data',
      body: `<p class="prof-text">Everything is saved only on this phone, in this app's own storage (keys starting with <span class="imp-accent">imp_</span>). Nothing is sent anywhere.</p>`,
    })}
    ${panel({
      title: 'Credits',
      body: `<p class="prof-text">Icons by <a class="imp-accent" href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> (Lorc, Delapouite &amp; contributors), licensed
        <a class="imp-accent" href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>.
        XP bolt icon by <a class="imp-accent" href="https://tabler.io/icons" target="_blank" rel="noopener">Tabler Icons</a> (MIT).
        Fonts: Silkscreen and VT323 (SIL Open Font License).</p>`,
    })}
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
    title: 'Player name',
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

// Food, Planner, Money ("coming soon") and Profile.
import * as H from '../habits.js';
import { esc, icon, panel, empty, sheet, toast } from '../ui.js';

const SOON = {
  food: { icon: 'food', title: 'Food', text: 'Calorie + protein tracking moves in here in a later phase. It will auto-check "Hit calories" and "Hit protein".' },
  planner: { icon: 'planner', title: 'Planner', text: 'Your schedule planner moves in here in a later phase. It will auto-check "Work done on schedule".' },
  money: { icon: 'wallet', title: 'Money', text: 'Spending log + budget come in a later phase. It will auto-check "Log spending".' },
};

export function renderSoon(root, tab) {
  const s = SOON[tab];
  root.innerHTML = `<div class="screen">${panel({
    title: s.title,
    meta: icon('lock'),
    body: empty({ icon: s.icon, title: 'Coming soon', text: `${esc(s.text)}<br><br><span class="imp-accent">LOADING<span class="imp-blink">_</span></span>` }),
  })}</div>`;
}

export function renderProfile(root) {
  const p = H.getProfile();
  root.innerHTML = `<div class="screen">
    ${panel({
      title: 'Player',
      body: `<div class="profile-row"><span class="imp-title">${esc(p.name)}</span>
        <button class="imp-btn imp-btn--secondary imp-btn--sm" data-act="edit-name">${icon('edit')}Rename</button></div>`,
    })}
    ${panel({
      title: 'Stats',
      meta: icon('lock'),
      body: empty({ icon: 'trophy', title: 'Coming soon', text: 'Levels, streaks and history charts arrive in Phase 2. Your check-ins are already being saved.' }),
    })}
    ${panel({
      title: 'Data',
      body: `<p class="profile-text">Everything is saved only on this phone, in this app's own storage (keys starting with <span class="imp-accent">imp_</span>). Nothing is sent anywhere.</p>`,
    })}
    ${panel({
      title: 'Credits',
      body: `<p class="profile-text">Icons by <a class="imp-accent" href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> (Lorc, Delapouite &amp; contributors), licensed
        <a class="imp-accent" href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>.
        XP bolt icon by <a class="imp-accent" href="https://tabler.io/icons" target="_blank" rel="noopener">Tabler Icons</a> (MIT).
        Fonts: Silkscreen and VT323 (SIL Open Font License).</p>`,
    })}
  </div>`;
}

export function bindProfile(root, refresh) {
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="edit-name"]')) openNameSheet(refresh);
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

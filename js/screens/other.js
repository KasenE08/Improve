// Food, Planner, Money: "coming soon" screens.
import { esc, icon, panel, empty } from '../ui.js';

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

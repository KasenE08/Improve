// Reusable HTML builders for the design-system components (see DESIGN.md).
// They return HTML strings so any screen, including the copied calorie tracker
// and planner, can use them without a framework.

export const ICON_URL = 'assets/icons/icons.svg';

// Icons available for categories in the picker
export const PICKER_ICONS = ['body', 'diet', 'skin', 'mind', 'money', 'style', 'people', 'sword', 'shield', 'book',
  'heart', 'star', 'music', 'home', 'coffee', 'moon', 'leaf', 'sparkles', 'scroll', 'flame', 'trophy', 'planner'];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icon = (name, cls = '') =>
  `<svg class="imp-icon ${cls}" aria-hidden="true"><use href="${ICON_URL}#${esc(name)}"></use></svg>`;

export const pct = (n, d) => (d > 0 ? Math.max(0, Math.min(100, Math.round((n / d) * 100))) : 0);

export function panel({ title, meta = '', body = '', cls = '', attrs = '' }) {
  return `<section class="imp-panel ${cls}" ${attrs}>
    <header class="imp-panel__head"><h2 class="imp-panel__title">${esc(title)}</h2><span class="imp-panel__meta">${meta}</span></header>
    <div class="imp-panel__body">${body}</div>
  </section>`;
}

export const xpbar = (p, cls = '') => `<div class="imp-xpbar ${cls}" style="--p:${p}%" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><div class="imp-xpbar__fill"></div></div>`;

export const statbar = (p) => `<div class="imp-statbar" style="--p:${p}%"><div class="imp-statbar__fill"></div></div>`;

export const statRow = ({ icon: ic, name, value, p }) =>
  `<div class="imp-stat">${icon(ic, 'imp-stat__icon')}<span class="imp-stat__name">${esc(name)}</span>${statbar(p)}<span class="imp-stat__val">${esc(value)}</span></div>`;

export const check = (on, count = '') =>
  `<span class="imp-check${on ? ' is-on' : ''}">${icon('check')}${count !== '' ? `<span class="imp-check__count">${count}</span>` : ''}</span>`;

export const chip = (xp, on) => `<span class="imp-chip${on ? ' is-on' : ''}">+${xp}<small>XP</small></span>`;

export const pips = (n, total) =>
  `<span class="imp-pips">${Array.from({ length: total }, (_, i) => `<span class="imp-pip${i < n ? ' is-on' : ''}"></span>`).join('')}</span>`;

export const lvl = (n) => `<div class="imp-lvl"><span class="imp-lvl__label">LV</span><span class="imp-lvl__num">${n}</span></div>`;

export const empty = ({ icon: ic, title, text }) =>
  `<div class="imp-empty">${icon(ic, 'imp-empty__icon')}<p class="imp-title">${esc(title)}</p><p class="imp-empty__text">${text}</p></div>`;

// Floating "+20 XP" over an element
export function floatXP(el, amount) {
  if (!amount) return;
  const f = document.createElement('span');
  f.className = 'imp-float' + (amount < 0 ? ' is-neg' : '');
  f.textContent = (amount > 0 ? '+' : '') + amount + ' XP';
  el.appendChild(f);
  setTimeout(() => f.remove(), 900);
}

let toastTimer;
export function toast(msg) {
  let t = document.querySelector('.imp-toast');
  if (!t) { t = document.createElement('div'); t.className = 'imp-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

// ---- Bottom sheet ----
// sheet.open({ title, body, onMount(el) })  → shows a modal; sheet.close()
export const sheet = {
  el: null,
  open({ title, body, onMount }) {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'imp-sheet';
      this.el.innerHTML = `<div class="imp-sheet__backdrop" data-close></div>
        <div class="imp-sheet__panel imp-panel" role="dialog" aria-modal="true">
          <header class="imp-panel__head"><h2 class="imp-panel__title"></h2>
            <button class="imp-btn imp-btn--sm imp-btn--ghost" data-close aria-label="Close">Close</button></header>
          <div class="imp-sheet__body"></div></div>`;
      this.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) this.close(); });
      document.body.appendChild(this.el);
    }
    this.el.querySelector('.imp-panel__title').textContent = title;
    const b = this.el.querySelector('.imp-sheet__body');
    b.onclick = b.oninput = null; // drop handlers from a previous sheet
    b.innerHTML = body;
    this.el.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    onMount && onMount(b);
  },
  close() {
    if (!this.el) return;
    this.el.classList.remove('is-open');
    document.documentElement.style.overflow = '';
  },
};

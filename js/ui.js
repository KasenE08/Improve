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

export const streakTag = (count, current, unit) =>
  `<span class="imp-streak${current ? '' : ' is-pending'}" title="${count} ${unit} streak">${icon('flame')}${count} ${esc(unit)}</span>`;

export const meter = (label, p, val) =>
  `<div class="imp-meter"><span class="imp-meter__label">${esc(label)}</span>${xpbar(p, 'imp-xpbar--sm')}<span class="imp-meter__val">${val}</span></div>`;

export const attrRow = (c) =>
  `<div class="imp-attr">${icon(c.icon, 'imp-attr__icon')}
    <div class="imp-attr__top"><span class="imp-attr__name">${esc(c.name)}</span><span class="imp-attr__lv">LV ${c.level}</span></div>
    <div class="imp-meter">${xpbar(c.pct, 'imp-xpbar--sm')}<span class="imp-attr__xp">${Math.floor(c.into)}/${Math.ceil(c.need)}</span></div>
  </div>`;

// Big full-screen moments (level up, perfect day). Queued so they show one at a time.
const burstQueue = [];
export function burst({ icon: ic, title, big = '', sub = '' }) {
  burstQueue.push({ ic, title, big, sub });
  if (burstQueue.length === 1) showBurst();
}
function showBurst() {
  const b = burstQueue[0];
  if (!b) return;
  const el = document.createElement('div');
  el.className = 'imp-burst';
  el.setAttribute('role', 'alertdialog');
  el.innerHTML = `<div class="imp-burst__box">${icon(b.ic, 'imp-burst__icon')}<p class="imp-burst__title">${esc(b.title)}</p>
    ${b.big ? `<p class="imp-burst__big">${esc(b.big)}</p>` : ''}${b.sub ? `<p class="imp-burst__sub">${esc(b.sub)}</p>` : ''}
    <p class="imp-burst__hint">Tap to continue</p></div>`;
  const close = () => { el.remove(); clearTimeout(t); burstQueue.shift(); showBurst(); };
  const t = setTimeout(close, 3500);
  el.addEventListener('click', close);
  document.body.appendChild(el);
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

// Pixel-style confirm pop-up. Resolves true (OK) or false (Cancel / tap outside).
// confirmBox({ title, text, ok: 'Edit', cancel: 'Cancel', icon: 'edit' })
export function confirmBox({ title, text = '', ok = 'OK', cancel = 'Cancel', icon: ic = 'info' }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'imp-dialog';
    el.setAttribute('role', 'alertdialog');
    el.innerHTML = `<div class="imp-dialog__box">${icon(ic, 'imp-dialog__icon')}
      <p class="imp-dialog__title">${esc(title)}</p>${text ? `<p class="imp-dialog__text">${esc(text)}</p>` : ''}
      <div class="imp-dialog__btns"><button class="imp-btn imp-btn--secondary" data-v="0">${esc(cancel)}</button>
      <button class="imp-btn imp-btn--primary" data-v="1">${esc(ok)}</button></div></div>`;
    const done = (v) => { el.remove(); resolve(v); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (b) done(b.dataset.v === '1');
      else if (e.target === el) done(false);
    });
    document.body.appendChild(el);
    el.querySelector('[data-v="1"]').focus();
  });
}

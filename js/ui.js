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

/** A habit's box by level: 0 empty, 1 Minimum (soft fill), 2 Full (solid) */
export const checkLevel = (level) =>
  `<span class="imp-check${level === 2 ? ' is-on' : level === 1 ? ' is-min' : ''}">${icon('check')}</span>`;

// ---- Completion feedback: a small burst from the box, different every time ----
// level 2 (Full) is bigger than level 1 (Minimum); now and then a Full gets a surprise.
const COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#ec4899'];
const WORDS = ['Vote cast', 'Locked in', "That's who you are", 'Stacked', 'Another rep', 'Built different', 'Keep going'];
const rnd = (a, b) => a + Math.random() * (b - a);
export function tickReward(el, level = 2, { surprise = Math.random() < 0.12 } = {}) {
  if (!el || typeof document === 'undefined') return;
  if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const layer = document.createElement('div');
  layer.className = 'tick-fx';
  layer.style.cssText = `left:${cx}px;top:${cy}px`;
  const big = level === 2 && surprise;
  const style = big ? 'confetti' : level === 2 ? ['spark', 'ring', 'stars', 'confetti'][Math.floor(Math.random() * 4)] : 'soft';
  const hue = COLORS[Math.floor(Math.random() * COLORS.length)];
  const parts = [];
  const n = { soft: 5, spark: 12, ring: 8, stars: 7, confetti: big ? 42 : 16 }[style];
  if (style === 'ring' || style === 'soft') parts.push(`<i class="tick-fx__ring" style="--c:${level === 2 ? hue : 'var(--imp-accent)'}"></i>`);
  if (style === 'ring') parts.push(`<i class="tick-fx__ring tick-fx__ring--2" style="--c:${COLORS[(COLORS.indexOf(hue) + 2) % COLORS.length]}"></i>`);
  for (let i = 0; i < n; i++) {
    const a = (360 / n) * i + rnd(-12, 12);
    const d = style === 'soft' ? rnd(14, 22) : big ? rnd(60, 150) : rnd(26, 52);
    const c = style === 'spark' ? hue : COLORS[i % COLORS.length];
    const shape = style === 'stars' ? 'tick-fx__star' : style === 'confetti' ? 'tick-fx__bit' : 'tick-fx__dot';
    parts.push(`<i class="${shape}" style="--a:${a}deg;--d:${d}px;--c:${c};--r:${Math.round(rnd(-300, 300))}deg;--t:${rnd(0.45, big ? 1.1 : 0.7).toFixed(2)}s"></i>`);
  }
  if (big) parts.push(`<b class="tick-fx__word">${WORDS[Math.floor(Math.random() * WORDS.length)]}</b>`);
  layer.innerHTML = parts.join('');
  document.body.appendChild(layer);
  el.classList.remove('is-popped'); void el.offsetWidth; el.classList.add('is-popped');
  navigator.vibrate?.(level === 2 ? (big ? [12, 40, 12] : 12) : 6);
  setTimeout(() => layer.remove(), big ? 1500 : 900);
}

/** Water: a small win for each 40 oz bottle, a bigger one at the goal. Returns true if it showed something. */
export function waterWin(before, after, goal = 100, bottle = 40) {
  if (!(after > before)) return false;
  if (before < goal && after >= goal) {
    burst({ icon: 'skin', title: `${goal} oz`, big: '', sub: 'Water done for today' });
    return true;
  }
  const b0 = Math.floor(before / bottle), b1 = Math.floor(after / bottle);
  if (b1 > b0) {
    toast(`Bottle ${b1} down · ${Math.max(0, goal - after)} oz to go`);
    const hud = document.querySelector('.hcard--water, .food-bar') || document.body;
    tickReward(hud.querySelector('.hcard__big, .food-val') || hud, 2, { surprise: false });
    return true;
  }
  return false;
}

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

// Streak flame, level 1–4 (small orange, big orange-red, blue, purple). Gradients live in index.html (#fo1–#fi4).
const FLAME_OUT = 'M12 1C12.9 5.4 16.2 7.6 17.6 11.2c.8-1.4.9-3 .4-4.6C20.9 9.4 22.4 13.2 22.4 17.8 22.4 24.2 17.8 29 12 29S1.6 24.6 1.6 18.4c0-3.4 1.6-6.3 3.7-8.3-.1 2.1.5 3.9 2.1 5.1C6.9 9.9 9.4 5.1 12 1Z';
const FLAME_IN = 'M12 12.6c.7 3.1 3.9 5 3.9 9.4a3.9 3.9 0 0 1-7.8 0c0-2.1 1-3.5 2-4.6.2 1.1.7 1.7 1.3 2-.3-2.3-.1-4.6.6-6.8Z';
export const flame = (lv) => {
  const t = Math.max(1, Math.min(4, lv));
  const embers = t >= 2 ? '<i class="imp-ember"></i>'.repeat(t >= 4 ? 5 : 3) : '';
  return `<span class="imp-flame" aria-hidden="true"><svg viewBox="0 0 24 30"><path class="imp-flame__o" d="${FLAME_OUT}" fill="url(#fo${t})"/><path class="imp-flame__i" d="${FLAME_IN}" fill="url(#fi${t})"/></svg>${embers}</span>`;
};

// Streak badge: { count, atRisk, lv (1–4), unit ('days'…) }. At risk = missed yesterday: gray flame + "do it today".
export const streakBadge = ({ count, atRisk, lv, unit, warn = 'do it today' }) => {
  const label = `${count} ${unit} streak${atRisk ? `, ${warn}` : ''}`;
  const top = `${flame(lv)}<b>${count}</b><small>${esc(unit)}</small>`;
  return atRisk
    ? `<span class="imp-sbadge t${lv} is-risk" role="img" aria-label="${esc(label)}"><span class="imp-sbadge__top">${top}</span><span class="imp-sbadge__warn">${esc(warn)}</span></span>`
    : `<span class="imp-sbadge t${lv}" role="img" aria-label="${esc(label)}">${top}</span>`;
};

export const meter = (label, p, val) =>
  `<div class="imp-meter"><span class="imp-meter__label">${esc(label)}</span>${xpbar(p, 'imp-xpbar--sm')}<span class="imp-meter__val">${val}</span></div>`;

export const attrRow = (c) =>
  `<div class="imp-attr">${icon(c.icon, 'imp-attr__icon')}
    <div class="imp-attr__top"><span class="imp-attr__name">${esc(c.name)}</span><span class="imp-attr__lv">LV ${c.level}</span></div>
    <div class="imp-meter">${xpbar(c.pct, 'imp-xpbar--sm')}<span class="imp-attr__xp">${Math.floor(c.into)}/${Math.ceil(c.need)}</span></div>
  </div>`;

// Big full-screen moments (level up, perfect day). Queued so they show one at a time.
const burstQueue = [];
export function burst({ icon: ic, title, big = '', sub = '', html = '', cls = '', count = 0, ms = 3500 }) {
  burstQueue.push({ ic, title, big, sub, html, cls, count, ms });
  if (burstQueue.length === 1) showBurst();
}
function showBurst() {
  const b = burstQueue[0];
  if (!b) return;
  const el = document.createElement('div');
  el.className = 'imp-burst';
  el.setAttribute('role', 'alertdialog');
  el.innerHTML = b.html || `<div class="imp-burst__box">${icon(b.ic, 'imp-burst__icon')}<p class="imp-burst__title">${esc(b.title)}</p>
    ${b.big ? `<p class="imp-burst__big">${esc(b.big)}</p>` : ''}${b.sub ? `<p class="imp-burst__sub">${esc(b.sub)}</p>` : ''}
    <p class="imp-burst__hint">Tap to continue</p></div>`;
  if (b.cls) el.classList.add(...b.cls.split(' '));
  const close = () => { el.remove(); clearTimeout(t); burstQueue.shift(); showBurst(); };
  const t = setTimeout(close, b.ms);
  // Count the big number up to the streak
  const num = b.count && el.querySelector('[data-count]');
  if (num) {
    const t0 = performance.now(), dur = Math.min(900, 250 + b.count * 6);
    const step = (now) => { const p = Math.min(1, (now - t0) / dur); num.textContent = Math.round(b.count * (1 - Math.pow(1 - p, 3))); if (p < 1 && el.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  el.addEventListener('click', close);
  document.body.appendChild(el);
}

// Streak milestone popup: flame for the level, count-up number, sparks. Top level is gold.
export function streakBurst({ n, unit, lv, name, newFlame }) {
  const sparks = Array.from({ length: 12 }, (_, i) => `<i class="imp-spark" style="--a:${i * 30}deg"></i>`).join('');
  const one = unit.replace(/s$/, '');
  burst({
    cls: 'imp-burst--streak',
    count: n,
    ms: 4500,
    html: `<div class="imp-burst__box imp-sburst t${lv}${lv >= 4 ? ' is-gold' : ''}">
      <div class="imp-sburst__flame"><i class="imp-sburst__ring"></i>${sparks}${flame(lv)}</div>
      <p class="imp-sburst__num" data-count>${n}</p>
      <p class="imp-burst__title">${n}-${esc(one)} streak${newFlame ? ' · new flame' : ''}</p>
      <p class="imp-burst__sub">${esc(name)}</p>
      <p class="imp-burst__hint">Tap to continue</p></div>`,
  });
}

// Perfect Day / Week / Month popup. Day: red star. Week: gold star, the 7 days light up. Month: all gold, confetti.
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.2l-5.9 3.3 1.3-6.6-4.9-4.5 6.6-.8z';
export function perfectBurst(kind, { sub = '', count = 0 } = {}) {
  const n = { day: 10, week: 14, month: 18 }[kind];
  const dist = { day: 70, week: 84, month: 100 }[kind];
  const sparks = Array.from({ length: n }, (_, i) => `<i class="imp-spark" style="--a:${(360 / n) * i}deg;--d:${-dist}px"></i>`).join('');
  const title = { day: 'Perfect Day', week: 'Perfect Week', month: 'Perfect Month' }[kind];
  const seven = kind === 'week' ? `<div class="imp-pb__seven">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => `<i style="--i:${i}">${d}</i>`).join('')}</div>` : '';
  const big = kind === 'month' && count ? `<p class="imp-pb__count" data-count>${count}</p>` : '';
  let confetti = '';
  if (kind === 'month' && !(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    const colors = ['#f5d061', '#e8b923', '#fff4c2', '#2563eb', '#ffffff', '#c99212'];
    confetti = Array.from({ length: 70 }, (_, i) => `<i class="imp-confetti" style="left:${Math.random() * 100}vw;background:${colors[i % colors.length]};--dx:${Math.round((Math.random() - 0.5) * 120)}px;--r:${Math.round(Math.random() * 720)}deg;animation-duration:${(1.6 + Math.random() * 1.6).toFixed(2)}s;animation-delay:${(Math.random() * 0.5).toFixed(2)}s"></i>`).join('');
  }
  burst({
    cls: 'imp-burst--perfect',
    count: kind === 'month' ? count : 0,
    ms: kind === 'day' ? 3500 : 5000,
    html: `<div class="imp-burst__box imp-pb imp-pb--${kind}">
      <div class="imp-pb__star"><i class="imp-pb__ring"></i>${sparks}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg></div>
      ${seven}${big}<p class="imp-burst__title">${title}</p>${sub ? `<p class="imp-burst__sub">${esc(sub)}</p>` : ''}
      <p class="imp-burst__hint">Tap to continue</p></div>${confetti}`,
  });
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

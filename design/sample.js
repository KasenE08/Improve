/* Shared markup + behavior for the design samples.
   Every style page renders the same components; only the CSS differs. */
(function () {
  const ICON_SETS = { lucide: 'Lucide', ph: 'Phosphor', tabler: 'Tabler', 'game-icons': 'Game-icons' };
  const KEY = 'imp_design_iconset_' + (document.body.dataset.style || 'x'); // preview-only, imp_ prefix

  const daily = [
    { cat: 'body', name: '7–9 hrs sleep', xp: 20, done: true },
    { cat: 'body', name: '8–10k steps', xp: 10 },
    { cat: 'diet', name: 'Hit protein', xp: 20, done: true },
    { cat: 'diet', name: '3L water', xp: 10 },
    { cat: 'skin', name: 'AM skincare', xp: 10, done: true },
    { cat: 'mind', name: 'Journal', xp: 10 },
    { cat: 'mind', name: 'No phone first 30 min', xp: 10 },
  ];
  const weekly = [
    { cat: 'body', name: 'Lift', xp: 20, target: 5, count: 2 },
    { cat: 'people', name: 'Time with friends', xp: 25 },
    { cat: 'money', name: 'Save % of paycheck', xp: 25, done: true },
  ];
  const stats = [
    ['body', 'Body', 72], ['diet', 'Diet', 58], ['skin', 'Skin', 81], ['mind', 'Mind', 64],
    ['money', 'Money', 40], ['style', 'Style', 35], ['people', 'People', 50],
  ];
  const tabs = [['today', 'Today'], ['food', 'Food'], ['planner', 'Planner'], ['wallet', 'Money'], ['profile', 'Profile']];
  const catName = { body: 'Body', diet: 'Diet', skin: 'Skin', mind: 'Mind', money: 'Money', style: 'Style', people: 'People' };

  const ic = (k) => `<i class="ic" data-icon="${k}"></i>`;

  function habitRow(h, i, list) {
    const multi = h.target > 1;
    const done = multi ? h.count >= h.target : !!h.done;
    const pips = multi
      ? `<span class="pips">${Array.from({ length: h.target }, (_, n) => `<span class="pip${n < h.count ? ' on' : ''}"></span>`).join('')}</span>`
      : '';
    return `<button class="habit${done ? ' is-done' : ''}" data-list="${list}" data-i="${i}">
      <span class="check">${ic('check')}</span>
      <span class="habit-body">
        <span class="habit-name">${h.name}</span>
        <span class="habit-sub">${ic(h.cat)}${catName[h.cat]}${multi ? ` · ${h.count}/${h.target} this week` : ''}</span>
        ${pips}
      </span>
      <span class="xp-chip">+${h.xp}<small>XP</small></span>
    </button>`;
  }

  function render() {
    const root = document.getElementById('app');
    root.innerHTML = `
    <header class="hud">
      <div class="lvl" style="--p:.62"><span class="lvl-label">LV</span><span class="lvl-num">7</span></div>
      <div class="hud-main">
        <div class="hud-top"><span class="name">KASEN</span><span class="rank">Initiate</span></div>
        <div class="xpbar" role="progressbar" aria-valuenow="62" aria-valuemin="0" aria-valuemax="100"><div class="xpbar-fill" style="--p:62%"></div></div>
        <div class="hud-meta"><span class="num">1,240 / 2,000 XP</span><span class="today">${ic('xp')}<b class="num" id="xpToday">0</b>&nbsp;today</span></div>
      </div>
    </header>
    <main class="screen">
      <section class="panel">
        <div class="panel-head"><h2>Daily</h2><span class="count num" id="cnt-daily"></span></div>
        <div class="list">${daily.map((h, i) => habitRow(h, i, 'daily')).join('')}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>This Week</h2><span class="count num" id="cnt-weekly"></span></div>
        <div class="list">${weekly.map((h, i) => habitRow(h, i, 'weekly')).join('')}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Attributes</h2><span class="count">${ic('trophy')}</span></div>
        <div class="stats">${stats.map(([k, n, v]) => `
          <div class="stat"><span class="stat-ic">${ic(k)}</span><span class="stat-name">${n}</span>
            <span class="statbar"><span class="statbar-fill" style="--p:${v}%"></span></span><span class="stat-val num">${v}</span></div>`).join('')}
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Controls &amp; Type</h2></div>
        <div class="btn-row">
          <button class="btn btn-primary">+ New Habit</button>
          <button class="btn btn-secondary">Edit</button>
          <button class="btn btn-ghost">Skip</button>
        </div>
        <div class="type">
          <div class="type-h">Heading Font</div>
          <div class="type-b">Body text for habit names and descriptions.</div>
          <div class="type-n num">1,240 XP · 7/9 · 62%</div>
          <div class="type-cap" id="fontNote"></div>
        </div>
      </section>
    </main>
    <nav class="tabbar">${tabs.map(([k, n], i) => `<a class="tab${i === 0 ? ' is-active' : ''}" href="#">${ic(k)}<span>${n}</span></a>`).join('')}</nav>`;
    const note = document.body.dataset.fonts;
    if (note) document.getElementById('fontNote').textContent = note;
    paintIcons();
    update();
  }

  function update() {
    let xp = 0;
    const tally = (list) => {
      let done = 0;
      list.forEach((h) => {
        if (h.target > 1) { xp += h.xp * h.count; if (h.count >= h.target) done++; }
        else if (h.done) { xp += h.xp; done++; }
      });
      return `${done}/${list.length}`;
    };
    document.getElementById('cnt-daily').textContent = tally(daily);
    document.getElementById('cnt-weekly').textContent = tally(weekly);
    document.getElementById('xpToday').textContent = '+' + xp;
  }

  function floatXP(el, amount) {
    const f = document.createElement('span');
    f.className = 'xp-float';
    f.textContent = (amount > 0 ? '+' : '') + amount + ' XP';
    el.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('.habit');
    if (b) {
      const h = (b.dataset.list === 'daily' ? daily : weekly)[+b.dataset.i];
      let gained;
      if (h.target > 1) {
        if (h.count >= h.target) { gained = -h.xp * h.count; h.count = 0; } else { h.count++; gained = h.xp; }
      } else { h.done = !h.done; gained = h.done ? h.xp : -h.xp; }
      const html = habitRow(h, b.dataset.i, b.dataset.list);
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      const nb = tmp.firstElementChild; b.replaceWith(nb);
      paintIcons(nb);
      if (gained > 0) floatXP(nb, gained);
      update();
      return;
    }
    if (e.target.closest('.tab, .btn')) e.preventDefault();
    const s = e.target.closest('[data-set]');
    if (s) { setSet(s.dataset.set); }
  });

  let current = document.body.dataset.defaultSet || 'lucide';
  try { current = localStorage.getItem(KEY) || current; } catch (_) {}
  if (!ICON_SETS[current]) current = 'lucide';

  function setSet(s) {
    current = s;
    try { localStorage.setItem(KEY, s); } catch (_) {}
    document.querySelectorAll('[data-set]').forEach((b) => b.classList.toggle('on', b.dataset.set === s));
    document.body.dataset.iconset = s;
    paintIcons();
  }

  function paintIcons(scope) {
    const set = window.IMP_ICONS[current];
    (scope || document).querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = set[el.dataset.icon] || ''; });
  }

  function previewBar() {
    const bar = document.createElement('div');
    bar.className = 'preview-bar';
    bar.innerHTML = `<a href="./">&larr; All styles</a><span>Icons:</span>` +
      Object.entries(ICON_SETS).map(([k, n]) => `<button data-set="${k}">${n}</button>`).join('');
    document.body.prepend(bar);
  }

  previewBar();
  render();
  setSet(current);
})();

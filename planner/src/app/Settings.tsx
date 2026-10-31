import type { BlockTag, CutoffRule, Location, Settings as S, TaskScope } from '../core/types';
import { WHOLE_MORNING } from '../core/availability';
import { dateKey } from '../core/time';
import { actions, endOfDayMin, parseBackup, type AppData } from './model';
import { commit, OLD_APP_KEY } from './store';
import { Chips, useUI } from './ui';
import { Icon, TAG_STYLE, type IconName } from './icons';
import { useState } from 'preact/hooks';
import { behind } from './Today';
import { disablePush, enablePush, pushSupported, sendTest, uploadNow } from './push';
import { fmtMin, inputToMin, minToInput, recurrenceText, ruleText, TAG_LABELS, TYPE_LABELS, uid, WEEKDAYS } from './format';
import { learnedRatio } from '../core/estimate';
import type { AssignmentType } from '../core/types';

export function Settings({ data }: { data: AppData }) {
  const ui = useUI();
  const today = dateKey(Date.now());
  const locName = (id: string) => data.locations.find((l) => l.id === id)?.name ?? '?';
  const byStart = (a: { startMin: number }, b: { startMin: number }) => a.startMin - b.startMin;
  const recurring = data.blocks.filter((b) => b.recurrence.kind !== 'once').sort(byStart);
  const events = data.blocks
    .filter((b) => b.recurrence.kind === 'once' && b.recurrence.date >= today)
    .sort((a, b) => (a.recurrence as { date: string }).date.localeCompare((b.recurrence as { date: string }).date) || byStart(a, b));

  const blockRow = (b: (typeof data.blocks)[number]) => (
    <button class="g-row" onClick={() => ui.open({ kind: 'block', block: b })}>
      <span class="g-icon"><Icon name={TAG_STYLE[b.tag].icon} size={17} /></span>
      <span class="g-main">
        <span class="g-title">{b.title}</span>
        <span class="g-sub">
          {recurrenceText(b.recurrence)} · {fmtMin(b.startMin)}–{fmtMin(b.endMin)} · {locName(b.locationId)}
          {b.blocksScheduling === false ? ' · assignments allowed' : ''}
        </span>
      </span>
      <Icon name="chevronRight" size={18} />
    </button>
  );

  const [page, setPage] = useState<Page | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const go = (p: Page | null) => {
    setPage(p);
    setPlaceId(null);
  };

  if (page) {
    const place = placeId ? data.locations.find((l) => l.id === placeId) : undefined;
    const sub = (title: string, body: preact.ComponentChildren) => (
      <div class="set-page">
        <div class="set-sub">
          <button class="set-back" onClick={() => (place ? setPlaceId(null) : go(null))} aria-label="Back">
            <Icon name="chevronLeft" size={20} />
          </button>
          <h2>{place ? place.name : title}</h2>
        </div>
        {body}
      </div>
    );
    if (page === 'schedule')
      return sub('Schedule', <>
        <h3 class="g-head">Repeating</h3>
        <div class="group">
          {recurring.map(blockRow)}
          <button class="g-row g-add" onClick={() => ui.open({ kind: 'block' })}><Icon name="plus" size={18} /> Add repeating time</button>
        </div>
        <h3 class="g-head">One-time, coming up</h3>
        <div class="group">
          {events.map(blockRow)}
          <button class="g-row g-add" onClick={() => ui.open({ kind: 'block', once: true })}><Icon name="plus" size={18} /> Add event</button>
        </div>
      </>);
    if (page === 'places') return sub('Places', <Locations data={data} editing={placeId} setEditing={setPlaceId} />);
    if (page === 'rules')
      return sub('Planning rules', <>
        <h3 class="g-head">Pacing</h3>
        <General settings={data.settings} />
        <h3 class="g-head">Cutoffs</h3>
        <Rules data={data} />
        <h3 class="g-head">Learning</h3>
        <Learning data={data} />
      </>);
    if (page === 'notify') return sub('Notifications', <Notifications data={data} />);
    return sub('Backup', <Backup data={data} />);
  }

  const s = data.settings;
  const places = data.locations.filter((l) => l.id !== 'home').length;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const tile = (p: Page, icon: IconName, title: string, value: preact.ComponentChildren, wide = false) => (
    <button class={`set-tile ${wide ? 'wide' : ''}`} onClick={() => go(p)}>
      <span class="set-tile__icon"><Icon name={icon} size={20} /></span>
      <span class="set-tile__text">
        <span class="set-tile__title">{title}</span>
        <span class="set-tile__value">{value}</span>
      </span>
      {wide && <span class="chev"><Icon name="chevronRight" size={18} /></span>}
    </button>
  );
  return (
    <div class="set-hub">
      {tile('schedule', 'calendar', 'Schedule', `${plural(recurring.length, 'repeating time')} · ${events.length} coming up`, true)}
      <div class="set-grid">
        {tile('places', 'pin', 'Places', places ? plural(places, 'place') : 'Only home')}
        {tile('rules', 'gauge', 'Planning rules', `${s.breakMin} min breaks`)}
        {tile('notify', 'bell', 'Notifications', data.push ? (data.push.error ? <span class="warn">Needs attention</span> : 'On') : 'Off')}
        {tile('backup', 'download', 'Backup', 'Save or restore')}
      </div>
      {data.tasks.some((t) => t.status === 'todo') && (
        <button class="set-behind" onClick={behind}>
          <Icon name="clock" size={18} /> Falling behind? Reschedule the rest of today
        </button>
      )}
      <p class="muted small center">Times follow your phone's timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
    </div>
  );
}

type Page = 'schedule' | 'places' | 'rules' | 'notify' | 'backup';

function Locations({ data, editing, setEditing }: { data: AppData; editing: string | null; setEditing: (id: string | null) => void }) {
  const set = (locations: Location[]) => commit((d, now) => actions.setLocations(d, locations, now));
  const places = data.locations.filter((l) => l.id !== 'home');
  const current = places.find((l) => l.id === editing);
  if (current) return <PlaceEditor data={data} place={current} back={() => setEditing(null)} />;
  return (
    <section>
      <div class="group">
        {places.map((l) => {
          const links = Object.keys(l.travelFrom ?? {}).length;
          return (
            <button class="g-row place-row" onClick={() => setEditing(l.id)}>
              <span class="g-icon"><Icon name="pin" size={17} /></span>
              <span class="g-main">
                <span class="g-title">{l.name}</span>
                <span class="g-sub">{l.fromHomeMin} min from home · {l.toHomeMin} back{links ? ` · ${links} other ${links === 1 ? 'route' : 'routes'}` : ''}</span>
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
          );
        })}
        <button class="g-row g-add" onClick={() => {
          const id = uid();
          set([...data.locations, { id, name: 'New place', fromHomeMin: 15, toHomeMin: 15 }]);
          setEditing(id);
        }}>
          <Icon name="plus" size={18} /> Add place
        </button>
      </div>
      <p class="g-foot">Tap a place to set how long it takes to get there from home or from any other place.</p>
    </section>
  );
}

/** One place: its name, and every travel time to get there (from home or straight from another place). */
function PlaceEditor({ data, place, back }: { data: AppData; place: Location; back: () => void }) {
  const set = (p: Partial<Location>) => commit((d, now) => actions.setLocations(d, d.locations.map((l) => (l.id === place.id ? { ...l, ...p } : l)), now));
  const others = data.locations.filter((l) => l.id !== 'home' && l.id !== place.id);
  const min = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  const num = (value: number | '', onChange: (v: string) => void) => (
    <span class="g-num">
      <input type="number" inputMode="numeric" min={0} placeholder="–" value={value} onChange={(e) => onChange(e.currentTarget.value)} />
      min
    </span>
  );
  return (
    <section>
      <div class="group">
        <label class="g-row">
          <span class="g-label">Name</span>
          <input class="g-text" value={place.name} onChange={(e) => set({ name: e.currentTarget.value.trim() || place.name })} />
        </label>
      </div>

      <h3 class="g-head">Getting here</h3>
      <div class="group">
        <label class="g-row">
          <span class="g-label">From Home</span>
          {num(place.fromHomeMin, (v) => set({ fromHomeMin: min(v) }))}
        </label>
        {others.map((o) => (
          <label class="g-row">
            <span class="g-label">From {o.name}</span>
            {num(place.travelFrom?.[o.id] ?? '', (v) => {
              const t = { ...place.travelFrom };
              if (v === '') delete t[o.id];
              else t[o.id] = min(v);
              set({ travelFrom: t });
            })}
          </label>
        ))}
      </div>
      <p class="g-foot">"From {others[0]?.name ?? 'another place'}" is used when an event here says it's coming straight from there. Leave it blank if you never go that way.</p>

      <h3 class="g-head">Leaving</h3>
      <div class="group">
        <label class="g-row">
          <span class="g-label">Back to Home</span>
          {num(place.toHomeMin, (v) => set({ toHomeMin: min(v) }))}
        </label>
      </div>

      <div class="group">
        <button class="g-row g-danger" onClick={() => {
          const used = data.blocks.some((b) => b.locationId === place.id);
          if (!confirm(used ? `${place.name} is used by fixed times; they will have no travel time. Delete?` : `Delete ${place.name}?`)) return;
          commit((d, now) => actions.setLocations(d, d.locations.filter((x) => x.id !== place.id), now));
          back();
        }}>Delete place</button>
      </div>
    </section>
  );
}

const TAGS = Object.entries(TAG_LABELS) as [BlockTag, string][];

function Rules({ data }: { data: AppData }) {
  const [open, setOpen] = useState<string | null>(null);
  const set = (rules: CutoffRule[]) => commit((d, now) => actions.setRules(d, rules, now));
  /** A new rule opens right away so it can be set up. */
  const addRule = (r: CutoffRule) => {
    set([...data.rules, r]);
    setOpen(r.id);
  };
  const patch = (id: string, p: Partial<CutoffRule>) =>
    set(data.rules.map((r) => (r.id === id ? ({ ...r, ...p } as CutoffRule) : r)));
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const scope = (r: CutoffRule) => (
    <select value={r.appliesTo} onChange={(e) => patch(r.id, { appliesTo: e.currentTarget.value as TaskScope })}>
      <option value="schoolwork">schoolwork</option>
      <option value="all">any task</option>
    </select>
  );
  const tag = (r: CutoffRule & { tag: BlockTag }) => (
    <select value={r.tag} onChange={(e) => patch(r.id, { tag: e.currentTarget.value as BlockTag })}>
      {TAGS.map(([v, l]) => <option value={v}>{l.toLowerCase()}</option>)}
    </select>
  );
  /** Weekday chips; undefined means every day. */
  const days = (r: CutoffRule, value: number[] | undefined) => {
    const cur = value ?? [0, 1, 2, 3, 4, 5, 6];
    return (
      <Chips
        options={WEEKDAYS.map((l, i) => ({ value: i, label: l }))}
        selected={cur}
        onToggle={(d) => patch(r.id, { weekdays: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d] })}
      />
    );
  };

  return (
    <section>
      <div class="group">
      {data.rules.map((r) => open !== r.id ? (
        <button class="g-row rule-line" onClick={() => setOpen(r.id)}>
          <span class="g-main"><span class="g-title">{ruleText(r)}</span></span>
          <Icon name="chevronRight" size={18} />
        </button>
      ) : (
        <div class="card rule">
          <div class="rule-text">
            No {scope(r)}
            {r.kind === 'afterBlock' && (
              <> for <input type="number" inputMode="numeric" value={r.minutes} onChange={(e) => patch(r.id, { minutes: num(e.currentTarget.value) })} /> min after getting home from {tag(r)}</>
            )}
            {r.kind === 'beforeBlock' && (
              <>
                {' '}
                {r.minutes >= WHOLE_MORNING ? (
                  <button class="chip on" onClick={() => patch(r.id, { minutes: 60 })}>all morning</button>
                ) : (
                  <> for <input type="number" inputMode="numeric" value={r.minutes} onChange={(e) => patch(r.id, { minutes: num(e.currentTarget.value) })} /> min</>
                )}{' '}
                before{' '}
                <select value={r.from ?? 'start'} onChange={(e) => patch(r.id, { from: e.currentTarget.value as 'start' | 'leave' })}>
                  <option value="start">the start of</option>
                  <option value="leave">leaving for</option>
                </select>{' '}
                {tag(r)}
                {r.minutes < WHOLE_MORNING && (
                  <button class="link small" onClick={() => patch(r.id, { minutes: WHOLE_MORNING })}>make it all morning</button>
                )}
              </>
            )}
            {r.kind === 'window' && (
              <> from <input type="time" value={minToInput(r.startMin)} onChange={(e) => patch(r.id, { startMin: inputToMin(e.currentTarget.value) })} /> to{' '}
                <input type="time" value={minToInput(r.endMin % 1440)} onChange={(e) => patch(r.id, { endMin: inputToMin(e.currentTarget.value) || 1440 })} /></>
            )}
          </div>
          {r.kind === 'window' && days(r, r.weekdays)}
          {r.kind === 'beforeBlock' && days(r, r.weekdays)}
          <div class="rule-actions">
            <button class="link danger small" onClick={() => confirm('Delete this rule?') && set(data.rules.filter((x) => x.id !== r.id))}>
              Delete rule
            </button>
            <button class="btn small primary" onClick={() => setOpen(null)}>Done</button>
          </div>
        </div>
      ))}
      </div>
      <p class="g-foot">Times the app won't schedule work. Tap one to change it.</p>
      <select class="add-rule" value="" onChange={(e) => {
        const k = e.currentTarget.value;
        const id = uid();
        if (k === 'after') addRule({ id, kind: 'afterBlock', tag: 'other', minutes: 30, appliesTo: 'all' });
        if (k === 'before') addRule({ id, kind: 'beforeBlock', tag: 'other', minutes: 30, appliesTo: 'all' });
        if (k === 'window') addRule({ id, kind: 'window', weekdays: [], startMin: 0, endMin: 60, appliesTo: 'all' });
        e.currentTarget.value = '';
      }}>
        <option value="">+ Add rule</option>
        <option value="after">After something</option>
        <option value="before">Before something</option>
        <option value="window">Time window</option>
      </select>
    </section>
  );
}

function General({ settings }: { settings: S }) {
  const set = (p: Partial<S>) => commit((d, now) => actions.setSettings(d, { ...d.settings, ...p }, now));
  const numRow = (label: string, key: Exclude<keyof S, 'spreadWork'>, unit = 'min') => (
    <label class="g-row">
      <span class="g-label">{label}</span>
      <span class="g-num">
        <input type="number" inputMode="numeric" value={settings[key]} onChange={(e) => set({ [key]: Math.max(0, Number(e.currentTarget.value) || 0) })} /> {unit}
      </span>
    </label>
  );
  const timeRow = (label: string, value: string, onChange: (v: string) => void) => (
    <label class="g-row">
      <span class="g-label">{label}</span>
      <input class="g-time" type="time" value={value} onChange={(e) => onChange(e.currentTarget.value)} />
    </label>
  );
  return (
    <section>
      <div class="group">
        <label class="g-row">
          <span class="g-label">Spread work across days</span>
          <input class="g-switch" type="checkbox" checked={settings.spreadWork !== false} onChange={(e) => set({ spreadWork: e.currentTarget.checked })} />
        </label>
        {timeRow('Earliest start', minToInput(settings.earliestStartMin), (v) => set({ earliestStartMin: inputToMin(v) }))}
        {timeRow('No work after', minToInput(settings.dayEndMin % 1440), (v) => set({ dayEndMin: endOfDayMin(inputToMin(v), settings.earliestStartMin) }))}
        {timeRow('Falling behind until', minToInput(settings.latestNightMin), (v) => set({ latestNightMin: inputToMin(v) }))}
      </div>
      <p class="g-foot">
        {settings.spreadWork !== false
          ? 'Spread: each assignment goes on the least busy day that still gets it done on time.'
          : 'Off: assignments fill the earliest days first.'}
      </p>
      <div class="group">
        {numRow('Break between', 'breakMin')}
        {numRow('Short task is up to', 'shortTaskMaxMin')}
        {numRow('Break between short ones', 'shortPairBreakMin')}
        {numRow('Split tasks over', 'bigTaskMin')}
        {numRow('Extra estimate time', 'paddingPct', '%')}
        {numRow('Plan ahead', 'horizonDays', 'days')}
      </div>
    </section>
  );
}

function Learning({ data }: { data: AppData }) {
  const rows = (Object.keys(TYPE_LABELS) as AssignmentType[])
    .map((t) => ({ t, ...learnedRatio(data.history, t) }))
    .filter((r) => r.samples > 0);
  return (
    <section>
      <div class="group">
        {rows.map((r) => (
          <div class="g-row">
            <span class="g-label">{TYPE_LABELS[r.t]}</span>
            <span class="g-value">{r.samples < 3 ? `${r.samples} of 3 timed` : `${Math.round(r.ratio * 100)}% of usual`}</span>
          </div>
        ))}
        {rows.length === 0 && <div class="g-row"><span class="g-label muted">Nothing timed yet</span></div>}
      </div>
      <p class="g-foot">Tap Start and Done on assignments and estimates adjust to how long you really take (after 3 of a type).</p>
    </section>
  );
}

function Backup({ data }: { data: AppData }) {
  // Replaces the planner data with a copy. The old app's data is only read, never changed.
  const restore = (text: string) => {
    const next = parseBackup(text, Date.now(), data);
    if (!confirm(`Replace the Planner tab's data with this copy (${next.tasks.length} tasks, ${next.blocks.length} fixed times)?`)) return;
    commit(() => next);
    alert('Copied into Improve.');
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      restore(await f.text());
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const copyDirect = () => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(OLD_APP_KEY);
    } catch {
      /* storage blocked */
    }
    if (!raw) return alert('No Schedule Planner data found in this app’s storage. On iPhone each home-screen app has its own storage: use a backup file instead.');
    try {
      restore(JSON.stringify({ app: 'schedule-app-planner', data: JSON.parse(raw) }));
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <section>
      <p class="g-foot g-foot--top">Your planner is saved in Improve&apos;s own backup (on the You page), so there&apos;s nothing extra to do here.</p>
      <h3 class="g-head">Copy from the old Schedule Planner</h3>
      <div class="group">
        <label class="g-row g-action">
          <span class="g-icon"><Icon name="download" size={17} /></span>
          <span class="g-main"><span class="g-title">Choose a backup file</span><span class="g-sub">Exported from the old app</span></span>
          <input type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.currentTarget.files?.[0])} />
          <Icon name="chevronRight" size={18} />
        </label>
        <button class="g-row g-action" onClick={copyDirect}>
          <span class="g-icon"><Icon name="list" size={17} /></span>
          <span class="g-main"><span class="g-title">Copy directly</span><span class="g-sub">Only if the old app runs in this same browser</span></span>
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
      <p class="g-foot">One-time copy. The old app is only read, never changed.</p>
    </section>
  );
}

function Notifications({ data }: { data: AppData }) {
  const ui = useUI();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const p = data.push;
  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) alert(done);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const unsupported = pushSupported();
  return (
    <section>
      {!p ? (
        <>
          <p class="g-foot g-foot--top">A notification when it&apos;s time to start each assignment, plus laundry steps. Uses your free notification server (one-time setup).</p>
          {unsupported && <p class="g-warn">{unsupported}</p>}
          <div class="group">
            <label class="g-row g-stack">
              <span class="g-label">Server address</span>
              <input class="g-text" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://planner-push.yourname.workers.dev"
                value={url} onInput={(e) => setUrl(e.currentTarget.value)} />
            </label>
            <button class="g-row g-action" onClick={() => ui.open({ kind: 'notifyGuide' })}>
              <span class="g-main"><span class="g-title">How to set it up</span></span>
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
          <button class="btn primary wide" disabled={busy || !url} onClick={() => run(() => enablePush(url), 'Notifications are on.')}>
            Turn on notifications
          </button>
        </>
      ) : (
        <>
          <div class="group">
            <div class="g-row">
              <span class="g-label">Status</span>
              <span class="g-value">{p.error ? <span class="warn">{p.error}</span> : p.uploadedAt ? `On · updated ${new Date(p.uploadedAt).toLocaleDateString()}` : 'On · updating…'}</span>
            </div>
            <label class="g-row">
              <span class="g-label">Days ahead</span>
              <span class="g-num">
                <input type="number" inputMode="numeric" value={data.settings.notifyDays} onChange={(e) => {
                  const v = Math.min(28, Math.max(1, Number(e.currentTarget.value) || 7));
                  commit((d) => ({ ...d, settings: { ...d.settings, notifyDays: v } }));
                }} /> days
              </span>
            </label>
            <button class="g-row g-action" disabled={busy} onClick={() => run(sendTest, 'Test sent. It should arrive in a few seconds.')}>
              <span class="g-main"><span class="g-title">Send a test</span></span>
              <Icon name="chevronRight" size={18} />
            </button>
            {p.error && (
              <button class="g-row g-action" disabled={busy} onClick={() => run(uploadNow)}>
                <span class="g-main"><span class="g-title">Retry</span></span>
                <Icon name="chevronRight" size={18} />
              </button>
            )}
          </div>
          <div class="group">
            <button class="g-row g-danger" disabled={busy} onClick={() => confirm('Turn off notifications?') && run(disablePush)}>Turn off notifications</button>
          </div>
        </>
      )}
    </section>
  );
}

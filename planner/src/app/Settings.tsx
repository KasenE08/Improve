import { parseBackup, type AppData } from './model';
import { commit, OLD_APP_KEY } from './store';
import { useUI } from './ui';
import { Icon, type IconName } from './icons';
import { useState } from 'preact/hooks';
import { disablePush, enablePush, pushSupported, sendTest, uploadNow } from './push';

export function Settings({ data }: { data: AppData }) {
  const [page, setPage] = useState<Page | null>(null);
  const go = (p: Page | null) => setPage(p);

  if (page) {
    const sub = (title: string, body: preact.ComponentChildren) => (
      <div class="set-page">
        <div class="set-sub">
          <button class="set-back" onClick={() => go(null)} aria-label="Back">
            <Icon name="chevronLeft" size={20} />
          </button>
          <h2>{title}</h2>
        </div>
        {body}
      </div>
    );
    if (page === 'notify') return sub('Notifications', <Notifications data={data} />);
    return sub('Backup', <Backup data={data} />);
  }

  // Calendar style: events and assignments are made and changed right on the calendar, so only these are left
  const row = (p: Page, icon: IconName, title: string, value: preact.ComponentChildren) => (
    <button class="g-row" onClick={() => go(p)}>
      <span class="g-icon"><Icon name={icon} size={17} /></span>
      <span class="g-main"><span class="g-title">{title}</span><span class="g-sub">{value}</span></span>
      <Icon name="chevronRight" size={18} />
    </button>
  );
  return (
    <div class="set-hub">
      <div class="group">
        {row('notify', 'bell', 'Notifications', data.push ? (data.push.error ? <span class="warn">Needs attention</span> : '5 min before each event · On') : 'Off')}
        {row('backup', 'download', 'Backup', 'Save or restore')}
      </div>
      <p class="g-foot">Times follow your phone's timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
    </div>
  );
}

type Page = 'notify' | 'backup';

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
          <p class="g-foot g-foot--top">A reminder 5 minutes before each event and assignment. Uses your free notification server (one-time setup).</p>
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

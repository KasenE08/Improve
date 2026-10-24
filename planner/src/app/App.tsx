import { useState } from 'preact/hooks';
import { getData, useData, useNow } from './store';
import { OPEN_TASK_EVENT, takePendingTask } from './openTask';
import { UI, type Sheet } from './ui';
import { Today } from './Today';
import { TaskList } from './TaskList';
import { Settings } from './Settings';
import { TaskForm } from './TaskForm';
import { TaskDetail } from './TaskDetail';
import { BlockForm } from './BlockForm';
import { NotifyGuide } from './NotifyGuide';
import { Profile } from './Profile';
import { useEffect } from 'preact/hooks';
import { Icon } from './icons';

type Tab = 'today' | 'tasks' | 'settings' | 'profile';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Schedule' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'settings', label: 'Settings' },
  { id: 'profile', label: 'Stats' },
];

export function App() {
  const data = useData();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('today');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const ui = { open: setSheet, close: () => setSheet(null) };

  // Tapping a notification opens its task (Improve passes it on through openTaskEvents).
  useEffect(() => {
    const openTask = (id: string | null | undefined) => {
      if (!id || !getData().tasks.some((t) => t.id === id)) return;
      setTab('today');
      setSheet({ kind: 'detail', id });
    };
    openTask(takePendingTask());
    const onOpen = () => openTask(takePendingTask());
    window.addEventListener(OPEN_TASK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TASK_EVENT, onOpen);
  }, []);

  return (
    <UI.Provider value={ui}>
      <div class="pl-subnav">
        <div class="segmented" role="tablist">
          {TABS.map((t) => (
            <button class={tab === t.id ? 'on' : ''} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button class="pl-add" aria-label="Add assignment" onClick={() => setSheet({ kind: 'task' })}>
          <Icon name="plus" size={24} />
        </button>
      </div>
      <main class="screen">
        {tab === 'today' && <Today data={data} now={now} />}
        {tab === 'tasks' && <TaskList data={data} now={now} />}
        {tab === 'settings' && <Settings data={data} />}
        {tab === 'profile' && <Profile data={data} now={now} />}
      </main>
      {sheet?.kind === 'task' && <TaskForm data={data} task={sheet.task} />}
      {sheet?.kind === 'detail' && <TaskDetail data={data} id={sheet.id} />}
      {sheet?.kind === 'block' && <BlockForm data={data} block={sheet.block} once={sheet.once} />}
      {sheet?.kind === 'notifyGuide' && <NotifyGuide />}
    </UI.Provider>
  );
}

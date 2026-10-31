import { useState } from 'preact/hooks';
import { getData, useData, useNow } from './store';
import { OPEN_TASK_EVENT, takePendingTask } from './openTask';
import { SheetFrame, UI, useUI, type Sheet } from './ui';
import { Today } from './Today';
import { TaskList } from './TaskList';
import { Settings } from './Settings';
import { TaskForm } from './TaskForm';
import { TaskDetail } from './TaskDetail';
import { BlockForm } from './BlockForm';
import { NotifyGuide } from './NotifyGuide';
import { useEffect } from 'preact/hooks';
import { Icon } from './icons';

// Two views. Adding things is under +, rarely used settings under ⋯ (stats live on Improve's You page).
type Tab = 'today' | 'tasks';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Schedule' },
  { id: 'tasks', label: 'Assignments' },
];

function AddMenu() {
  const ui = useUI();
  const item = (icon: string, title: string, sub: string, open: () => void) => (
    <button class="add-item" onClick={open}>
      <span class="add-item__icon"><Icon name={icon} size={22} /></span>
      <span class="add-item__text"><b>{title}</b><small>{sub}</small></span>
      <Icon name="chevronRight" size={18} />
    </button>
  );
  return (
    <SheetFrame title="Add">
      <div class="add-list">
        {item('book', 'Assignment', 'Homework, a project, studying', () => ui.open({ kind: 'task' }))}
        {item('flag', 'One-time event', 'Dentist, game, a trip', () => ui.open({ kind: 'block', once: true }))}
        {item('repeat', 'Repeating time', 'School, practice, work shifts', () => ui.open({ kind: 'block' }))}
      </div>
    </SheetFrame>
  );
}

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
        <button class="pl-more" aria-label="Planner settings" onClick={() => setSheet({ kind: 'settings' })}>
          <Icon name="more" size={22} />
        </button>
        <button class="pl-add" aria-label="Add" onClick={() => setSheet({ kind: 'add' })}>
          <Icon name="plus" size={24} />
        </button>
      </div>
      <main class="screen">
        {tab === 'today' && <Today data={data} now={now} />}
        {tab === 'tasks' && <TaskList data={data} now={now} />}
      </main>
      {sheet?.kind === 'add' && <AddMenu />}
      {sheet?.kind === 'settings' && (
        <SheetFrame title="Planner settings" full>
          <Settings data={data} />
        </SheetFrame>
      )}
      {sheet?.kind === 'task' && <TaskForm data={data} task={sheet.task} />}
      {sheet?.kind === 'detail' && <TaskDetail data={data} id={sheet.id} />}
      {sheet?.kind === 'block' && <BlockForm data={data} block={sheet.block} once={sheet.once} />}
      {sheet?.kind === 'notifyGuide' && <NotifyGuide />}
    </UI.Provider>
  );
}

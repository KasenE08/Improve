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

// One view: the day. The assignment list opens from its "to do" pill, adding from +, settings from ⋯ in
// Improve's top bar (it sends PLANNER_MENU_EVENT). Stats live on Improve's You page.
export const PLANNER_MENU_EVENT = 'improve:planner-menu';

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
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const ui = { open: setSheet, close: () => setSheet(null) };

  // Tapping a notification opens its task (Improve passes it on through openTaskEvents).
  useEffect(() => {
    const openTask = (id: string | null | undefined) => {
      if (!id || !getData().tasks.some((t) => t.id === id)) return;
      setSheet({ kind: 'detail', id });
    };
    openTask(takePendingTask());
    const onOpen = () => openTask(takePendingTask());
    const onMenu = () => setSheet({ kind: 'settings' });
    window.addEventListener(OPEN_TASK_EVENT, onOpen);
    window.addEventListener(PLANNER_MENU_EVENT, onMenu);
    return () => {
      window.removeEventListener(OPEN_TASK_EVENT, onOpen);
      window.removeEventListener(PLANNER_MENU_EVENT, onMenu);
    };
  }, []);

  return (
    <UI.Provider value={ui}>
      <main class="screen">
        <Today data={data} now={now} />
      </main>
      {sheet?.kind === 'add' && <AddMenu />}
      {sheet?.kind === 'list' && (
        <SheetFrame title="Assignments" full>
          <TaskList data={data} now={now} />
        </SheetFrame>
      )}
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

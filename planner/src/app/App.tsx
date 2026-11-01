import { useEffect, useState } from 'preact/hooks';
import { useData, useNow } from './store';
import { SheetFrame, UI, type Sheet } from './ui';
import { Day } from './Day';
import { EventForm } from './EventForm';
import { EventView } from './EventView';
import { Settings } from './Settings';
import { NotifyGuide } from './NotifyGuide';

// The Plan page: one day of events. Settings (notifications, backup) open from ⋯ in Improve's top bar,
// which sends PLANNER_MENU_EVENT.
export const PLANNER_MENU_EVENT = 'improve:planner-menu';

export function App() {
  const data = useData();
  const now = useNow();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const ui = { open: setSheet, close: () => setSheet(null) };

  useEffect(() => {
    const onMenu = () => setSheet({ kind: 'settings' });
    window.addEventListener(PLANNER_MENU_EVENT, onMenu);
    return () => window.removeEventListener(PLANNER_MENU_EVENT, onMenu);
  }, []);

  return (
    <UI.Provider value={ui}>
      <main class="screen">
        <Day data={data} now={now} />
      </main>
      {sheet?.kind === 'form' && <EventForm key={sheet.block?.id ?? 'new'} block={sheet.block} date={sheet.date} startMin={sheet.startMin} />}
      {sheet?.kind === 'view' && <EventView data={data} blockId={sheet.blockId} date={sheet.date} start={sheet.start} end={sheet.end} />}
      {sheet?.kind === 'settings' && (
        <SheetFrame title="Planner settings" full>
          <Settings data={data} />
        </SheetFrame>
      )}
      {sheet?.kind === 'notifyGuide' && <NotifyGuide />}
    </UI.Provider>
  );
}

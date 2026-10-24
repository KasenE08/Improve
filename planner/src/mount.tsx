// Planner tab entry, loaded on demand by Improve (js/app.js).
//   start(opts)        once per app launch: loads data (replans on a new day) and keeps notifications in sync
//   mount(el) / unmount(el)  shows / removes the Planner UI inside Improve's screen
//   openTask(id)       opens a task (from a notification tap)
import { render } from 'preact';
import { App } from './app/App';
import './app/styles.css';
import './app/improve-theme.css';
import { startPushSync } from './app/push';
import { getData, onChange } from './app/store';
import { OPEN_TASK_EVENT, setPendingTask } from './app/openTask';

let started = false;

export function start(opts: { onChange?: () => void } = {}) {
  if (started) return;
  started = true;
  startPushSync();
  if (opts.onChange) onChange(opts.onChange);
  navigator.storage?.persist?.();
}

export function mount(el: HTMLElement) {
  start();
  el.classList.add('planner-root');
  render(<App />, el);
}

export function unmount(el: HTMLElement) {
  render(null, el);
  el.classList.remove('planner-root');
}

// Always parked as pending, so it works whether or not the App has finished mounting.
export function openTask(id: string, mounted: boolean) {
  setPendingTask(id);
  if (mounted) window.dispatchEvent(new Event(OPEN_TASK_EVENT));
}

export { getData };

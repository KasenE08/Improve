// Opening a task from a notification tap. Improve sets a pending id (app opened by the tap)
// or fires the event (app already open); App picks it up.
export const OPEN_TASK_EVENT = 'imp-planner-open-task';
let pending: string | null = null;
export function setPendingTask(id: string | null) {
  pending = id;
}
export function takePendingTask(): string | null {
  const id = pending;
  pending = null;
  return id;
}

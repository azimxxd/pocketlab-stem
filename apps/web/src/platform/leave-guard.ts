let reason: string | null = null;
/** A lab registers why it must not be left silently (unsaved data); null clears the guard. */
export function setLeaveGuard(message: string | null) {
  reason = message;
}
/** Asks before in-app navigation away from unsaved work. Returns true when leaving is allowed. */
export function confirmLeave(): boolean {
  if (reason === null) return true;
  if (!window.confirm(reason)) return false;
  reason = null;
  return true;
}
window.addEventListener('beforeunload', (event) => {
  if (reason !== null) event.preventDefault();
});

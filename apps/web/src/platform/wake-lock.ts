/**
 * Keeps the screen on while a measurement runs, so a dimmed phone does not hide the page and
 * interrupt the attempt. Unsupported or refused wake locks never block the measurement.
 */
export function keepScreenOn(): () => void {
  let sentinel: WakeLockSentinel | null = null;
  let released = false;
  if ('wakeLock' in navigator)
    navigator.wakeLock
      .request('screen')
      .then((lock) => {
        if (released) void lock.release().catch(() => {});
        else sentinel = lock;
      })
      .catch(() => {});
  return () => {
    released = true;
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}

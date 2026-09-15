// A crash-survivable breadcrumb trail for the on-device segmentation pipeline.
// iOS can silently kill the tab for using too much memory (a hard OS-level
// kill, invisible to console.error and any try/catch) before a single log
// line ever reaches a connected debugger. Writing the current step to
// localStorage -- synchronous, and already flushed to disk before the next
// line of JS runs -- means the LAST step reached survives the crash and can
// be read back on the very next page load, even with no debugger attached.
const STORAGE_KEY = 'board-app:segmentDebugStep';

export function recordSegmentStep(step) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, ts: Date.now() }));
  } catch {
    // Best-effort diagnostic only -- never let this break the real flow.
  }
}

export function readLastSegmentStep() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSegmentStep() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore -- worst case the next read sees a stale step.
  }
}

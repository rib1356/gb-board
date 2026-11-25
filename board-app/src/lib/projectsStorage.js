// Whether Your projects is folded away, remembered per phone. A convenience
// only: if storage is unavailable it just starts open.
const STORAGE_KEY = 'board-app:projectsCollapsed';

export function getProjectsCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setProjectsCollapsed(collapsed) {
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Won't be remembered next time; the section still folds now.
  }
}

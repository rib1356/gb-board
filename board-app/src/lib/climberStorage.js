const STORAGE_KEY = 'board-app:currentClimberId';

export function getStoredClimberId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredClimberId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Selection just won't persist this session (private browsing, quota) --
    // the app still works, it just forgets the choice on reload.
  }
}

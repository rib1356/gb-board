// Checking every moved problem again (after volumes are re-marked, say) takes
// a while on a phone, so which ones are done is kept across reloads -- one
// check at a time, for the two photos it's between.
const STORAGE_KEY = 'board-app:checkAgain';

export function loadCheckAgain(from, to) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && saved.from === from && saved.to === to ? new Set(saved.ids) : null;
  } catch {
    return null;
  }
}

export function saveCheckAgain(from, to, ids) {
  try {
    if (ids) localStorage.setItem(STORAGE_KEY, JSON.stringify({ from, to, ids: [...ids] }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The check just won't survive a reload -- it still works meanwhile.
  }
}

// Unsaved check-in sheets, kept per injury so a dropped signal or an expired
// session doesn't lose what was typed.

const PREFIX = 'board-app:tweaks-draft:';

export function loadDraft(injuryId) {
  try {
    const raw = localStorage.getItem(PREFIX + injuryId);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && value.draft ? value : null;
  } catch {
    return null;
  }
}

export function saveDraft(injuryId, value) {
  try {
    localStorage.setItem(PREFIX + injuryId, JSON.stringify(value));
  } catch {
    // The draft just won't survive a reload (private browsing, quota).
  }
}

export function clearDraft(injuryId) {
  try {
    localStorage.removeItem(PREFIX + injuryId);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export function clearAllDrafts() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

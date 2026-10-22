import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadDraft, saveDraft, clearDraft, clearAllDrafts } from './checkinDrafts.js';

const value = {
  draft: {
    injury_id: 'i1', checked_on: '2026-10-13', pain_low: 1, pain_high: 2, pain_peak: 4,
    activities: ['board'], notes: 'Typed so far', needsTouch: false,
  },
  editingId: 'c9',
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('check-in drafts', () => {
  it('gives back what was saved', () => {
    saveDraft('i1', value);
    expect(loadDraft('i1')).toEqual(value);
    expect(localStorage.getItem('board-app:tweaks-draft:i1')).not.toBeNull();
  });

  it('returns null when there is none', () => {
    expect(loadDraft('i1')).toBeNull();
  });

  it('clearDraft removes only that injury', () => {
    saveDraft('i1', value);
    saveDraft('i2', value);
    clearDraft('i1');
    expect(loadDraft('i1')).toBeNull();
    expect(loadDraft('i2')).toEqual(value);
  });

  it('clearAllDrafts leaves other keys alone', () => {
    saveDraft('i1', value);
    saveDraft('i2', value);
    localStorage.setItem('board-app:currentClimberId', 'abc');
    clearAllDrafts();
    expect(loadDraft('i1')).toBeNull();
    expect(loadDraft('i2')).toBeNull();
    expect(localStorage.getItem('board-app:currentClimberId')).toBe('abc');
  });

  it('returns null for bad JSON', () => {
    localStorage.setItem('board-app:tweaks-draft:i1', '{nope');
    expect(loadDraft('i1')).toBeNull();
  });

  it('does not throw when storage fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => saveDraft('i1', value)).not.toThrow();
  });
});

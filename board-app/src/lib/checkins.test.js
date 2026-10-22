import { describe, it, expect } from 'vitest';
import {
  checkinsFor, checkinOn, newCheckinDraft, draftFromCheckin, checkinFields, mergeCheckin, planCheckinSave,
} from './checkins.js';

const C = (id, checked_on, created_at, extra = {}) =>
  ({ id, injury_id: 'i1', checked_on, created_at, pain_low: 1, pain_high: 2, pain_peak: null, activities: [], notes: null, ...extra });

const draftOf = (extra = {}) => ({
  injury_id: 'i1', checked_on: '2026-10-13', pain_low: 1, pain_high: 2, pain_peak: null,
  activities: ['board', 'rest'], notes: 'Board later, fine', needsTouch: false, ...extra,
});

describe('checkinsFor / checkinOn', () => {
  it('opens the later of two check-ins on the same day', () => {
    const all = [C('a', '2026-10-03', '2026-10-03T08:00:00Z'), C('b', '2026-10-03', '2026-10-03T20:00:00Z'), { ...C('x', '2026-10-03', 'z'), injury_id: 'i2' }];
    expect(checkinOn(all, 'i1', '2026-10-03').id).toBe('b');
    expect(checkinOn(all, 'i1', '2026-10-04')).toBeNull();
    expect(checkinsFor(all, 'i1').map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('orders newest date first', () => {
    const all = [C('a', '2026-10-01', 't1'), C('b', '2026-10-05', 't0')];
    expect(checkinsFor(all, 'i1').map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('newCheckinDraft', () => {
  it('starts from the last pain score, with Board ticked on a board day', () => {
    const checkins = [C('a', '2026-10-01', 't1', { pain_low: 3, pain_high: 4, pain_peak: 7 }), C('b', '2026-10-05', 't2', { pain_low: 1, pain_high: 2 })];
    expect(newCheckinDraft({ injuryId: 'i1', checkins, date: '2026-10-21', boardDays: new Set(['2026-10-21']) })).toEqual({
      injury_id: 'i1', checked_on: '2026-10-21', pain_low: 1, pain_high: 2, pain_peak: null,
      activities: ['board'], notes: '', needsTouch: false,
    });
    expect(newCheckinDraft({ injuryId: 'i1', checkins: [], date: '2026-10-21', boardDays: new Set() }))
      .toMatchObject({ pain_low: 0, pain_high: 0, activities: [], needsTouch: true });
  });
});

describe('draftFromCheckin', () => {
  it('copies the check-in, with null notes as empty and needsTouch false', () => {
    expect(draftFromCheckin(C('a', '2026-10-01', 't', { pain_peak: 5, activities: ['rest'] }))).toEqual({
      injury_id: 'i1', checked_on: '2026-10-01', pain_low: 1, pain_high: 2, pain_peak: 5,
      activities: ['rest'], notes: '', needsTouch: false,
    });
  });
});

describe('checkinFields', () => {
  it('drops needsTouch and trims notes', () => {
    const f = checkinFields(draftOf({ notes: '  hello ' }));
    expect(f).toEqual({
      injury_id: 'i1', checked_on: '2026-10-13', pain_low: 1, pain_high: 2, pain_peak: null,
      activities: ['board', 'rest'], notes: 'hello',
    });
    expect(f).not.toHaveProperty('needsTouch');
  });

  it('turns blank notes into null', () => {
    expect(checkinFields(draftOf({ notes: '  ' })).notes).toBeNull();
  });
});

describe('mergeCheckin', () => {
  const existing = C('a', '2026-10-13', 't', { pain_low: 1, pain_high: 1, pain_peak: 3, activities: ['rest'], notes: 'Stiff this morning' });

  it('adds to a day that already has a check-in without dropping anything', () => {
    expect(mergeCheckin(existing, draftOf())).toEqual({
      checked_on: '2026-10-13', pain_low: 1, pain_high: 2, pain_peak: 3,
      activities: ['rest', 'board'], notes: 'Stiff this morning\n\nBoard later, fine',
    });
    expect(mergeCheckin({ ...existing, pain_peak: 2 }, draftOf({ pain_high: 3 })).pain_peak).toBeNull();
    expect(mergeCheckin(existing, draftOf({ notes: '  ' })).notes).toBe('Stiff this morning');
  });

  it('keeps the higher of two spikes', () => {
    expect(mergeCheckin(existing, draftOf({ pain_peak: 6 })).pain_peak).toBe(6);
    expect(mergeCheckin(existing, draftOf({ pain_peak: 2 })).pain_peak).toBe(3);
  });

  it('gives null notes when neither side has any', () => {
    expect(mergeCheckin({ ...existing, notes: null }, draftOf({ notes: '' })).notes).toBeNull();
  });
});

describe('planCheckinSave', () => {
  const existing = C('a', '2026-10-13', 't', { notes: 'Stiff' });

  it('updates the check-in being edited, date and all', () => {
    const draft = draftOf({ checked_on: '2026-10-14' });
    expect(planCheckinSave({ draft, editingId: 'e1', existingOnDate: null }))
      .toEqual({ action: 'update', id: 'e1', fields: checkinFields(draft) });
  });

  it('merges into a day that already has one', () => {
    const draft = draftOf();
    expect(planCheckinSave({ draft, editingId: null, existingOnDate: existing }))
      .toEqual({ action: 'update', id: 'a', fields: mergeCheckin(existing, draft) });
  });

  it('otherwise creates', () => {
    const draft = draftOf();
    const plan = planCheckinSave({ draft, editingId: null, existingOnDate: null });
    expect(plan).toEqual({ action: 'create', fields: checkinFields(draft) });
    expect(plan.fields.injury_id).toBe('i1');
  });
});

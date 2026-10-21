// Rules for the Tweaks check-in sheet: which check-in a day opens, what a new
// one starts from, and how a save becomes a create or an update.

function newestFirst(a, b) {
  if (a.checked_on !== b.checked_on) return a.checked_on < b.checked_on ? 1 : -1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return 0;
}

export function checkinsFor(checkins, injuryId) {
  return checkins.filter((c) => c.injury_id === injuryId).sort(newestFirst);
}

// Two check-ins can share a date; the last created one is the one to open.
export function checkinOn(checkins, injuryId, date) {
  return checkinsFor(checkins, injuryId).find((c) => c.checked_on === date) ?? null;
}

export function newCheckinDraft({ injuryId, checkins, date, boardDays }) {
  const last = checkinsFor(checkins, injuryId)[0];
  return {
    injury_id: injuryId,
    checked_on: date,
    pain_low: last ? last.pain_low : 0,
    pain_high: last ? last.pain_high : 0,
    pain_peak: null,
    activities: boardDays.has(date) ? ['board'] : [],
    notes: '',
    // With no earlier score the sliders sit at 0 until the user moves one.
    needsTouch: !last,
  };
}

export function draftFromCheckin(checkin) {
  return {
    injury_id: checkin.injury_id,
    checked_on: checkin.checked_on,
    pain_low: checkin.pain_low,
    pain_high: checkin.pain_high,
    pain_peak: checkin.pain_peak,
    activities: [...checkin.activities],
    notes: checkin.notes ?? '',
    needsTouch: false,
  };
}

export function checkinFields(draft) {
  return {
    injury_id: draft.injury_id,
    checked_on: draft.checked_on,
    pain_low: draft.pain_low,
    pain_high: draft.pain_high,
    pain_peak: draft.pain_peak,
    activities: draft.activities,
    notes: draft.notes.trim() || null,
  };
}

// Saving onto a day that already has a check-in adds to it: nothing the
// earlier one recorded is dropped.
export function mergeCheckin(existing, draft) {
  const peaks = [existing.pain_peak, draft.pain_peak].filter((p) => p != null);
  const peak = peaks.length ? Math.max(...peaks) : null;
  const notes = [existing.notes, draft.notes]
    .map((n) => (n ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
  return {
    checked_on: draft.checked_on,
    pain_low: draft.pain_low,
    pain_high: draft.pain_high,
    // A spike only counts while it's above the day's highest pain.
    pain_peak: peak != null && peak > draft.pain_high ? peak : null,
    activities: [...new Set([...existing.activities, ...draft.activities])],
    notes: notes || null,
  };
}

export function planCheckinSave({ draft, editingId, existingOnDate }) {
  if (editingId) return { action: 'update', id: editingId, fields: checkinFields(draft) };
  if (existingOnDate) {
    return { action: 'update', id: existingOnDate.id, fields: mergeCheckin(existingOnDate, draft) };
  }
  return { action: 'create', fields: checkinFields(draft) };
}

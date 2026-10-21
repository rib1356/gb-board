import { daysBetween, addDays } from './dates';

export const SIDES = [['left', 'Left'], ['right', 'Right'], ['none', 'Both / n/a']];
export const AREAS = [
  ['finger', 'Finger'], ['wrist', 'Wrist'], ['elbow', 'Elbow'], ['shoulder', 'Shoulder'],
  ['back', 'Back'], ['knee', 'Knee'], ['other', 'Other'],
];
export const FINGERS = [['thumb', 'Thumb'], ['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['little', 'Little']];
export const ACTIVITIES = [
  ['board', 'Board'], ['indoor', 'Climbed inside'], ['outside', 'Outside'],
  ['fingerboard', 'Fingerboard'], ['rest', 'Rest day'], ['taped', 'Taped'],
];

// The app's en-GB date formatting, pinned to UTC so the YYYY-MM-DD string
// never shifts a day.
const format = (date, options) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options });


const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const clean = (text) => (typeof text === 'string' && text.trim() ? text.trim() : null);

// "RH middle finger", "L wrist", "Back" -- the side prefix is dropped when
// it doesn't apply.
export function injuryTitle({ side, area, finger, area_other }) {
  const hand = side === 'left' ? 'LH' : 'RH';
  const prefix = side === 'left' ? 'L' : 'R';
  let title;
  if (area === 'finger') {
    const name = finger === 'thumb' ? 'thumb' : finger ? `${finger} finger` : 'finger';
    title = side === 'none' ? name : `${hand} ${name}`;
  } else {
    const name = area === 'other' ? (area_other || 'other') : area;
    title = side === 'none' ? name : `${prefix} ${name}`;
  }
  return capitalise(title);
}

// Only the form's nine fields; blanks become null.
export function normaliseInjury(fields) {
  const startedOn = clean(fields.started_on);
  return {
    side: fields.side,
    area: fields.area,
    finger: fields.area === 'finger' ? fields.finger ?? null : null,
    area_other: fields.area === 'other' ? clean(fields.area_other) : null,
    what: clean(fields.what),
    symptoms: clean(fields.symptoms),
    started_on: startedOn,
    started_roughly: startedOn ? Boolean(fields.started_roughly) : false,
    how_it_happened: clean(fields.how_it_happened),
  };
}

export const painValue = (n) => String(Number(n));

export function formatPain({ pain_low, pain_high, pain_peak }) {
  const low = painValue(pain_low);
  const high = painValue(pain_high);
  const range = low === high ? low : `${low}–${high}`;
  return pain_peak == null ? range : `${range} / ${painValue(pain_peak)}`;
}

const sameYear = (date, today) => date.slice(0, 4) === today.slice(0, 4);

export function shortDate(date, today) {
  return format(date, { day: 'numeric', month: 'short', ...(sameYear(date, today) ? {} : { year: 'numeric' }) });
}

export function dayLabel(date, today) {
  // en-GB puts a comma after the weekday when there's a year, so join them here.
  return `${format(date, { weekday: 'short' })} ${shortDate(date, today)}`;
}

export function sheetDateLabel(date, today) {
  if (date === today) return `Today, ${dayLabel(date, today)}`;
  if (date === addDays(today, -1)) return `Yesterday, ${dayLabel(date, today)}`;
  return dayLabel(date, today);
}

export function monthYear(date) {
  return format(date, { month: 'short', year: '2-digit' });
}

export function startLine({ started_on, started_roughly }) {
  if (!started_on) return 'Started: not sure';
  const when = format(started_on, { day: 'numeric', month: 'short', year: 'numeric' });
  return started_roughly ? `Started around ${when}` : `Started ${when}`;
}

export function injuryStart(injury, checkins) {
  if (injury.started_on) return injury.started_on;
  const dates = checkins.filter((c) => c.injury_id === injury.id).map((c) => c.checked_on).sort();
  return dates[0] ?? injury.created_at.slice(0, 10);
}

export function lastCheckinLine(checkins, today) {
  if (checkins.length === 0) return 'No check-ins yet';
  const last = checkins.map((c) => c.checked_on).sort().at(-1);
  const days = daysBetween(last, today);
  if (days <= 0) return 'Checked in today';
  if (days === 1) return `Last check-in ${shortDate(last, today)}, yesterday`;
  return `Last check-in ${shortDate(last, today)}, ${days} days ago`;
}

const newestFirst = (key) => (a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0);

export function hubLists(injuries, checkins) {
  const sorted = [...injuries].sort(newestFirst((injury) => injuryStart(injury, checkins)));
  return {
    open: sorted.filter((injury) => !injury.closed_on),
    closed: sorted.filter((injury) => injury.closed_on),
  };
}

export function sameSpot(fields, injuries, excludeId) {
  const other = (text) => (text ?? '').trim().toLowerCase();
  return injuries
    .filter((injury) => injury.id !== excludeId
      && injury.side === fields.side
      && injury.area === fields.area
      && (fields.area !== 'finger' || injury.finger === fields.finger)
      && (fields.area !== 'other' || other(injury.area_other) === other(fields.area_other)))
    .sort(newestFirst((injury) => injury.started_on ?? injury.created_at.slice(0, 10)));
}

export function boardDays(ticks, climberName) {
  return new Set(ticks.filter((tick) => tick.sent_by === climberName).map((tick) => tick.sent_on));
}

// Dates here are YYYY-MM-DD strings, the way sends store sent_on. Arithmetic
// is done on UTC midnights, so a week or month boundary never moves when the
// clocks change.
const DAY_MS = 24 * 60 * 60 * 1000;
const toMs = (date) => Date.parse(`${date}T00:00:00Z`);
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);

// The phone's own calendar date -- not toISOString(), which is a day out
// between midnight and 1am in summer.
export function localDate(at = new Date()) {
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

export function addDays(date, days) {
  return fromMs(toMs(date) + days * DAY_MS);
}

export function daysBetween(from, to) {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

// Weeks run Monday to Sunday.
export function weekStartOf(date) {
  const ms = toMs(date);
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
  return fromMs(ms - sinceMonday * DAY_MS);
}

export function monthOf(date) {
  return date.slice(0, 7);
}

function shiftMonth(month, by) {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export const previousMonth = (month) => shiftMonth(month, -1);
export const nextMonth = (month) => shiftMonth(month, 1);

export function monthName(month) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
}

import { gradeNumber } from './problemList';
import { firstSendIds } from './sends';
import { addDays, daysBetween, localDate } from './dates';

// Board-wide numbers for the stats screen. Each takes the live problems and
// all the board's sends; sends on problems no longer on the board are
// ignored. Only named sends credit a climber, but any send at all means a
// problem has been climbed.

const earliestFirst = (a, b) => (
  a.sent_on < b.sent_on ? -1 : a.sent_on > b.sent_on ? 1 : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
);
const newestFirst = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
const summary = ({ id, name, grade }) => ({ id, name, grade });
const latestSend = (list) => list.reduce((max, t) => (t.sent_on > max ? t.sent_on : max), '');
const climbersOn = (list) => new Set(list.filter((t) => t.sent_by).map((t) => t.sent_by));

function liveTicks(problems, ticks) {
  const ids = new Set(problems.map((p) => p.id));
  return ticks.filter((t) => ids.has(t.problem_id));
}

function groupByProblem(ticks) {
  const groups = new Map();
  for (const t of ticks) {
    if (!groups.has(t.problem_id)) groups.set(t.problem_id, []);
    groups.get(t.problem_id).push(t);
  }
  return groups;
}

// month is YYYY-MM. Problems counts each problem once a day; New is first
// sends that happened this month; Flashes is those logged as a flash.
export function crewBoard(problems, ticks, month) {
  const byId = new Map(problems.map((p) => [p.id, p]));
  const live = liveTicks(problems, ticks);
  const firsts = firstSendIds(live);
  const rows = new Map();
  const counted = new Set();
  for (const t of live) {
    if (!t.sent_by || !t.sent_on.startsWith(`${month}-`)) continue;
    if (!rows.has(t.sent_by)) rows.set(t.sent_by, { name: t.sent_by, problems: 0, newTicks: 0, flashes: 0, top: null });
    const row = rows.get(t.sent_by);
    const key = `${t.sent_by}|${t.problem_id}|${t.sent_on}`;
    if (!counted.has(key)) {
      counted.add(key);
      row.problems += 1;
    }
    if (firsts.has(t.id)) {
      row.newTicks += 1;
      if (t.flash) row.flashes += 1;
    }
    const grade = gradeNumber(byId.get(t.problem_id).grade);
    if (grade !== null && (row.top === null || grade > row.top)) row.top = grade;
  }
  return [...rows.values()].sort((a, b) => b.newTicks - a.newTicks || b.problems - a.problems || a.name.localeCompare(b.name));
}

// The FA is the first send. If that was logged before climber names existed,
// nobody gets it -- not even whoever sent it next. Problems never sent aren't
// in the map. Repeats are the other climbers who've sent it.
export function firstAscents(problems, ticks) {
  const fas = new Map();
  for (const [id, list] of groupByProblem(liveTicks(problems, ticks))) {
    const first = [...list].sort(earliestFirst)[0];
    fas.set(id, first.sent_by
      ? { climber: first.sent_by, date: first.sent_on, loggedAt: first.created_at, repeats: climbersOn(list).size - 1 }
      : null);
  }
  return fas;
}

export function latestFAs(problems, ticks, limit = 5) {
  const fas = firstAscents(problems, ticks);
  return problems
    .filter((p) => fas.get(p.id))
    .map((p) => ({ ...summary(p), ...fas.get(p.id) }))
    .sort((a, b) => newestFirst(a.date, b.date) || newestFirst(a.loggedAt, b.loggedAt))
    .slice(0, limit);
}

export function faTally(problems, ticks) {
  const counts = new Map();
  for (const fa of firstAscents(problems, ticks).values()) {
    if (fa) counts.set(fa.climber, (counts.get(fa.climber) || 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Ascents are different climbers, not laps.
export function classics(problems, ticks, limit = 5) {
  const groups = groupByProblem(liveTicks(problems, ticks));
  return problems
    .filter((p) => p.rating)
    .map((p) => ({ ...summary(p), rating: p.rating, ascents: climbersOn(groups.get(p.id) || []).size }))
    .sort((a, b) => b.rating - a.rating || b.ascents - a.ascents || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// The last 30 days, today included.
export function popularLately(problems, ticks, today, limit = 5) {
  const from = addDays(today, -29);
  const byId = new Map(problems.map((p) => [p.id, p]));
  const recent = liveTicks(problems, ticks).filter((t) => t.sent_on >= from && t.sent_on <= today);
  return [...groupByProblem(recent)]
    .map(([id, list]) => ({ ...summary(byId.get(id)), climbers: climbersOn(list).size, sends: list.length, last: latestSend(list) }))
    .filter((p) => p.climbers > 0)
    .sort((a, b) => b.climbers - a.climbers || b.sends - a.sends || newestFirst(a.last, b.last))
    .slice(0, limit);
}

// Never sent by anyone, named or not: hardest first, ungraded last, then the
// longest open first. created_at is a timestamp, so it's turned into the
// phone's own date before counting.
export function openProjects(problems, ticks, today) {
  const sent = new Set(ticks.map((t) => t.problem_id));
  return problems
    .filter((p) => !sent.has(p.id))
    .map((p) => ({
      ...summary(p),
      setter: p.setter,
      daysOpen: p.created_at ? Math.max(0, daysBetween(localDate(new Date(p.created_at)), today)) : null,
    }))
    .sort((a, b) => {
      const ga = gradeNumber(a.grade);
      const gb = gradeNumber(b.grade);
      if (ga !== gb) {
        if (ga === null) return 1;
        if (gb === null) return -1;
        return gb - ga;
      }
      return (b.daysOpen ?? -1) - (a.daysOpen ?? -1);
    });
}

export function leastClimbedLately(problems, ticks, today, limit = 5) {
  const groups = groupByProblem(liveTicks(problems, ticks));
  return problems
    .filter((p) => groups.has(p.id))
    .map((p) => {
      const lastSent = latestSend(groups.get(p.id));
      return { ...summary(p), lastSent, daysAgo: daysBetween(lastSent, today) };
    })
    .sort((a, b) => (a.lastSent < b.lastSent ? -1 : a.lastSent > b.lastSent ? 1 : a.name.localeCompare(b.name)))
    .slice(0, limit);
}

export function daysAgoLabel(days) {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function openLabel(days) {
  if (days <= 0) return 'set today';
  return `open ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function repeatsLabel(repeats) {
  if (repeats === 0) return 'no repeats yet';
  return `${repeats} ${repeats === 1 ? 'repeat' : 'repeats'}`;
}

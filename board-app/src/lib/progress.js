import { buildLogbook } from './sends';
import { gradeNumber } from './problemList';
import { addDays, weekStartOf } from './dates';

// The week charts show up to a year, rolling after that.
export const MAX_WEEKS = 52;

function hardestOf(problems) {
  const grades = problems.map((p) => gradeNumber(p.grade)).filter((g) => g !== null);
  return grades.length ? Math.max(...grades) : null;
}

const sentIds = (days) => new Set(days.flatMap((d) => d.problems.map((p) => p.id)));

// One row per Mon-Sun week, from the week of the climber's first session to
// this week, capped to the last MAX_WEEKS. Built on buildLogbook, so a session
// is a day, a problem logged twice in a day counts once, and sends on problems
// no longer on the board are left out. "top" counts repeats: it's how hard
// you climbed that week, not only what was new.
export function weeklyProgress(problems, ticks, climberName, today) {
  const days = [...buildLogbook(problems, ticks, climberName)].reverse(); // oldest first
  if (days.length === 0) return [];
  const thisWeek = weekStartOf(today);
  const windowStart = addDays(thisWeek, -7 * (MAX_WEEKS - 1));
  const firstWeek = weekStartOf(days[0].date);
  const start = firstWeek > windowStart ? firstWeek : windowStart;

  const weeks = [];
  const byStart = new Map();
  for (let w = start; w <= thisWeek; w = addDays(w, 7)) {
    const week = { weekStart: w, sessions: 0, top: null, newTicks: 0, repeats: 0, ticked: 0 };
    weeks.push(week);
    byStart.set(w, week);
  }

  // Problems ticked before the window still count towards the running total.
  let ticked = 0;
  for (const day of days) {
    const fresh = day.problems.filter((p) => p.firstSend).length;
    if (day.date < start) {
      ticked += fresh;
      continue;
    }
    const week = byStart.get(weekStartOf(day.date));
    if (!week) continue; // dated after this week
    week.sessions += 1;
    week.newTicks += fresh;
    week.repeats += day.problems.length - fresh;
    const top = hardestOf(day.problems);
    if (top !== null && (week.top === null || top > week.top)) week.top = top;
  }
  for (const week of weeks) {
    ticked += week.newTicks;
    week.ticked = ticked;
  }
  return weeks;
}

// The three headline numbers. Sessions a week is the last 28 days (today
// included) over four, to one decimal.
export function progressTiles(problems, ticks, climberName, today) {
  const days = buildLogbook(problems, ticks, climberName);
  const from = addDays(today, -27);
  const recent = days.filter((d) => d.date >= from && d.date <= today).length;
  return {
    hardest: hardestOf(days.flatMap((d) => d.problems)),
    sessionsPerWeek: Math.round((recent / 4) * 10) / 10,
    ticked: sentIds(days).size,
    total: problems.length,
  };
}

// A row for each grade that has problems on the board, easiest first.
export function ticklist(problems, ticks, climberName) {
  const sent = sentIds(buildLogbook(problems, ticks, climberName));
  const graded = problems.map((p) => ({ id: p.id, grade: gradeNumber(p.grade) })).filter((p) => p.grade !== null);
  return [...new Set(graded.map((p) => p.grade))].sort((a, b) => a - b).map((grade) => {
    const atGrade = graded.filter((p) => p.grade === grade);
    return { grade, ticked: atGrade.filter((p) => sent.has(p.id)).length, total: atGrade.length };
  });
}

// The problems you've sent in the most sessions; a tie goes to the one you
// climbed most recently.
export function mostClimbed(problems, ticks, climberName, limit = 5) {
  const counts = new Map();
  // Newest day first, so the first time a problem turns up is its latest session.
  for (const day of buildLogbook(problems, ticks, climberName)) {
    for (const p of day.problems) {
      const entry = counts.get(p.id) || { id: p.id, name: p.name, grade: p.grade, sessions: 0, last: day.date };
      entry.sessions += 1;
      counts.set(p.id, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.sessions - a.sessions || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
    .slice(0, limit)
    .map(({ id, name, grade, sessions }) => ({ id, name, grade, sessions }));
}

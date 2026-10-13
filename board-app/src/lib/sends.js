import { gradeNumber } from './problemList';

// Sends logged before climber profiles carry no sent_by, so they belong to
// nobody -- a missing name never matches.
export function sentProblemIds(ticks, climberName) {
  if (!climberName) return new Set();
  return new Set(ticks.filter((t) => t.sent_by === climberName).map((t) => t.problem_id));
}

// One row per grade on the board, hardest first, with the climber's sent
// problems leading each row so it fills in from one side. Ungraded problems
// have nowhere to sit, so they're left out.
export function buildPyramid(problems, ticks, climberName) {
  const sent = sentProblemIds(ticks, climberName);
  const rows = new Map();
  for (const p of problems) {
    const n = gradeNumber(p.grade);
    if (n === null) continue;
    if (!rows.has(n)) rows.set(n, []);
    rows.get(n).push({ id: p.id, name: p.name, sent: sent.has(p.id) });
  }
  return [...rows.entries()]
    .sort(([a], [b]) => b - a)
    .map(([n, list]) => ({ grade: `V${n}`, problems: [...list.filter((p) => p.sent), ...list.filter((p) => !p.sent)] }));
}

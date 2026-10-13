import { gradeNumber } from './problemList';

// Sends logged before climber profiles carry no sent_by, so they belong to
// nobody -- a missing name never matches.
export function sentProblemIds(ticks, climberName) {
  if (!climberName) return new Set();
  return new Set(ticks.filter((t) => t.sent_by === climberName).map((t) => t.problem_id));
}

// Each climber's first send of each problem -- the only send that can be a
// flash. Earliest date wins; on the same date, whichever was logged first.
// Derived rather than stored, like the First send tag, so backdating a send
// moves it rather than leaving a stale flag behind.
export function firstSendIds(ticks) {
  const firsts = new Map();
  for (const t of ticks) {
    if (!t.sent_by) continue;
    const key = `${t.problem_id}|${t.sent_by}`;
    const best = firsts.get(key);
    if (!best || t.sent_on < best.sent_on || (t.sent_on === best.sent_on && t.created_at < best.created_at)) {
      firsts.set(key, t);
    }
  }
  return new Set([...firsts.values()].map((t) => t.id));
}

// One row per grade on the board, hardest first, with the climber's sent
// problems leading each row so it fills in from one side. Ungraded problems
// have nowhere to sit, so they're left out.
export function buildPyramid(problems, ticks, climberName) {
  const sent = sentProblemIds(ticks, climberName);
  const firsts = firstSendIds(ticks);
  const flashed = new Set(ticks.filter((t) => t.flash && t.sent_by === climberName && firsts.has(t.id)).map((t) => t.problem_id));
  const rows = new Map();
  for (const p of problems) {
    const n = gradeNumber(p.grade);
    if (n === null) continue;
    if (!rows.has(n)) rows.set(n, []);
    rows.get(n).push({ id: p.id, name: p.name, sent: sent.has(p.id), flashed: flashed.has(p.id) });
  }
  return [...rows.entries()]
    .sort(([a], [b]) => b - a)
    .map(([n, list]) => ({ grade: `V${n}`, problems: [...list.filter((p) => p.sent), ...list.filter((p) => !p.sent)] }));
}

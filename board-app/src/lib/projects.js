import { daysBetween } from './dates';

// A project with no session for this long moves to Gone cold. Working it
// again brings it straight back -- nothing about it is stored.
export const COLD_AFTER_DAYS = 28;

// Session rows are { problem_id, climber, worked_on }. Everything here is for
// one climber: other climbers' rows and sends never count.

export function workedOn(sessions, problemId, climber, date) {
  return sessions.some((s) => s.problem_id === problemId && s.climber === climber && s.worked_on === date);
}

// The climber's distinct session dates on each problem.
function datesByProblem(sessions, climber) {
  const byProblem = new Map();
  for (const s of sessions) {
    if (s.climber !== climber) continue;
    if (!byProblem.has(s.problem_id)) byProblem.set(s.problem_id, new Set());
    byProblem.get(s.problem_id).add(s.worked_on);
  }
  return byProblem;
}

// The climber's first send of each problem: the earliest date, and on the
// same date whichever was logged first -- the rule firstSendIds uses.
function firstSends(ticks, climber) {
  const firsts = new Map();
  for (const t of ticks) {
    if (t.sent_by !== climber) continue;
    const best = firsts.get(t.problem_id);
    if (!best || t.sent_on < best.sent_on || (t.sent_on === best.sent_on && t.created_at < best.created_at)) {
      firsts.set(t.problem_id, t);
    }
  }
  return firsts;
}

const newestFirst = (a, b) => (a.lastWorked < b.lastWorked ? 1 : a.lastWorked > b.lastWorked ? -1 : 0);

// Problems on the board the climber has worked and not sent, split into
// active and cold, each newest-worked first.
export function yourProjects(problems, sessions, ticks, climber, today) {
  const active = [];
  const cold = [];
  if (!climber) return { active, cold };
  const dates = datesByProblem(sessions, climber);
  const sent = firstSends(ticks, climber);
  for (const problem of problems) {
    const worked = dates.get(problem.id);
    if (!worked || sent.has(problem.id)) continue;
    const sorted = [...worked].sort();
    const project = { problem, sessions: sorted.length, firstWorked: sorted[0], lastWorked: sorted[sorted.length - 1] };
    (daysBetween(project.lastWorked, today) >= COLD_AFTER_DAYS ? cold : active).push(project);
  }
  return { active: active.sort(newestFirst), cold: cold.sort(newestFirst) };
}

// problemId -> how many sessions the climber's first send took: their session
// days on or before it, plus the send day itself. Only for problems they
// worked at least once by then; rows after a backdated send don't count.
export function sessionsToSend(sessions, ticks, climber) {
  const counts = new Map();
  if (!climber) return counts;
  const dates = datesByProblem(sessions, climber);
  for (const [problemId, first] of firstSends(ticks, climber)) {
    const upToSend = [...(dates.get(problemId) ?? [])].filter((d) => d <= first.sent_on);
    if (upToSend.length === 0) continue;
    counts.set(problemId, new Set([...upToSend, first.sent_on]).size);
  }
  return counts;
}

export function sessionsLabel(n) {
  return `${n} ${n === 1 ? 'session' : 'sessions'}`;
}

// The tag on a project's first send.
export function sendTagLabel(n) {
  return n === 1 ? 'First session' : sessionsLabel(n);
}

// Sends logged before climber profiles carry no sent_by, so they belong to
// nobody -- a missing name never matches.
export function sentProblemIds(ticks, climberName) {
  if (!climberName) return new Set();
  return new Set(ticks.filter((t) => t.sent_by === climberName).map((t) => t.problem_id));
}

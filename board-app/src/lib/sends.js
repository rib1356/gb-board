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

// The climber's sends grouped by the day they were sent, newest day first,
// each day in the order its sends were logged. A problem logged twice in a day
// shows once -- the earlier entry, which is the one that can be a first send.
// Sends on problems no longer on the board have nothing to show, so they're
// left out.
export function buildLogbook(problems, ticks, climberName) {
  const byId = new Map(problems.map((p) => [p.id, p]));
  const firsts = firstSendIds(ticks);
  const days = new Map();
  const mine = ticks
    .filter((t) => t.sent_by === climberName && byId.has(t.problem_id))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  for (const t of mine) {
    if (!days.has(t.sent_on)) days.set(t.sent_on, new Map());
    const day = days.get(t.sent_on);
    if (day.has(t.problem_id)) continue;
    const { id, name, grade } = byId.get(t.problem_id);
    const firstSend = firsts.has(t.id);
    day.set(t.problem_id, { id, name, grade, firstSend, flashed: firstSend && Boolean(t.flash) });
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, day]) => ({ date, problems: [...day.values()] }));
}

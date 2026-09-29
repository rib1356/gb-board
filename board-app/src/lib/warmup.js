export const FEELS = [
  { value: 'heavy', label: 'Heavy' },
  { value: 'normal', label: 'Normal' },
  { value: 'strong', label: 'Strong' },
];

// Past this many days a problem counts as fully "fresh" -- stops something
// untouched for six months from swamping everything else in the pool.
const MAX_AGE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function recencyWeight(problem, today) {
  if (!problem.last_sent_on) return MAX_AGE_DAYS + 1;
  const days = Math.max(0, Math.round((Date.parse(today) - Date.parse(problem.last_sent_on)) / DAY_MS));
  return Math.min(days, MAX_AGE_DAYS) + 1;
}

function pickWeighted(pool, today, rng) {
  const weights = pool.map((p) => recencyWeight(p, today));
  let r = rng() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// Sent problems first (you know they go); unsent only once those run out.
function poolFor(grade, problems, excludeIds) {
  const candidates = problems.filter((p) => p.grade === grade && !excludeIds.has(p.id));
  const sent = candidates.filter((p) => p.send_count > 0);
  if (sent.length) return { pool: sent, status: 'ok' };
  if (candidates.length) return { pool: candidates, status: 'unsent-fallback' };
  return { pool: [], status: 'no-problems' };
}

export function rollLadder(rungs, problems, { rng = Math.random, today = todayISO() } = {}) {
  const byId = new Map(problems.map((p) => [p.id, p]));
  const used = new Set(rungs.filter((r) => r.problemId && byId.has(r.problemId)).map((r) => r.problemId));
  return rungs.map((rung) => {
    if (rung.problemId) {
      const problem = byId.get(rung.problemId) || null;
      return { grade: rung.grade, random: false, problem, status: problem ? 'ok' : 'removed' };
    }
    const { pool, status } = poolFor(rung.grade, problems, used);
    if (!pool.length) return { grade: rung.grade, random: true, problem: null, status };
    const problem = pickWeighted(pool, today, rng);
    used.add(problem.id);
    return { grade: rung.grade, random: true, problem, status };
  });
}

function rerollPool(rolled, index, problems) {
  const entry = rolled[index];
  if (!entry?.random) return { pool: [], status: entry?.status };
  const exclude = new Set(rolled.filter((e) => e.problem).map((e) => e.problem.id));
  return poolFor(entry.grade, problems, exclude);
}

export function canReroll(rolled, index, problems) {
  return rerollPool(rolled, index, problems).pool.length > 0;
}

export function rerollRung(rolled, index, problems, { rng = Math.random, today = todayISO() } = {}) {
  const { pool, status } = rerollPool(rolled, index, problems);
  if (!pool.length) return rolled;
  const problem = pickWeighted(pool, today, rng);
  return rolled.map((e, i) => (i === index ? { ...e, problem, status } : e));
}

export function nextUnsentIndex(rolled, sentIds, fromIndex) {
  const n = rolled.length;
  for (let step = 1; step <= n; step++) {
    const i = (((fromIndex + step) % n) + n) % n;
    const entry = rolled[i];
    if (entry.problem && !sentIds.includes(entry.problem.id)) return i;
  }
  return -1;
}

export function sessionPayload(rolled, sentIds) {
  const problemIds = rolled.filter((e) => e.problem).map((e) => e.problem.id);
  return { problemIds, sentIds: problemIds.filter((id) => sentIds.includes(id)) };
}

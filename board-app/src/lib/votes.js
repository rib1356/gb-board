import { GRADES } from './grades';
import { gradeNumber } from './problemList';

// A vote counts only while its climber has a named send of that problem. That
// is worked out here rather than stored, like flashes, so deleting the send
// takes the vote out of the numbers and logging it again brings it back.
export function countedVotes(votes, ticks) {
  const sent = new Set(ticks.filter((t) => t.sent_by).map((t) => `${t.problem_id}|${t.sent_by}`));
  return votes.filter((v) => sent.has(`${v.problem_id}|${v.climber}`));
}

// The star average for a problem, with stars rounded to the nearest half. The
// old single rating stands in until the first star vote arrives.
export function starSummary(problem, counted) {
  const stars = counted.filter((v) => v.problem_id === problem.id && v.stars != null).map((v) => v.stars);
  if (stars.length > 0) {
    const average = stars.reduce((sum, s) => sum + s, 0) / stars.length;
    return { average, count: stars.length, stars: Math.round(average * 2) / 2, legacy: false };
  }
  if (problem.rating) return { average: problem.rating, count: 0, stars: problem.rating, legacy: true };
  return null;
}

// How many counted votes each grade has on a problem, easiest first.
export function gradeVoteCounts(problemId, counted) {
  const tally = new Map();
  for (const v of counted) {
    if (v.problem_id !== problemId || gradeNumber(v.grade) === null) continue;
    tally.set(v.grade, (tally.get(v.grade) || 0) + 1);
  }
  return [...tally.entries()]
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => gradeNumber(a.grade) - gradeNumber(b.grade));
}

// The grades a climber can vote for: one either side of the current grade,
// plus their saved vote if it sits outside those.
export function gradeChoices(currentGrade, myGrade) {
  const n = gradeNumber(currentGrade);
  if (n === null) return [];
  const choices = new Set([n - 1, n, n + 1].filter((i) => i >= 0 && i < GRADES.length).map((i) => GRADES[i]));
  if (gradeNumber(myGrade) !== null) choices.add(myGrade);
  return [...choices].sort((a, b) => gradeNumber(a) - gradeNumber(b));
}

// A climber's vote on a problem, or null. A missing name never matches.
export function voteFor(votes, problemId, climber) {
  if (!climber) return null;
  return votes.find((v) => v.problem_id === problemId && v.climber === climber) || null;
}

// The votes with that climber's row for the problem swapped for `row`, or just
// dropped when `row` is null.
export function replaceVote(votes, problemId, climber, row) {
  const rest = votes.filter((v) => !(v.problem_id === problemId && v.climber === climber));
  return row ? [...rest, row] : rest;
}

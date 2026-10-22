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

// A grade vote as the crew says it: "soft V5", "V5" or "hard V5".
export function gradeVoteLabel({ grade, feel }) {
  return feel === 'soft' || feel === 'hard' ? `${feel} ${grade}` : grade;
}

const FEEL_OFFSET = { soft: -0.25, hard: 0.25 };

function rank({ grade, feel }) {
  return gradeNumber(grade) + (FEEL_OFFSET[feel] ?? 0);
}

// How many counted votes each grade and feel has on a problem, easiest first.
export function gradeVoteCounts(problemId, counted) {
  const tally = new Map();
  for (const v of counted) {
    if (v.problem_id !== problemId || gradeNumber(v.grade) === null) continue;
    const feel = v.feel ?? null;
    const key = `${v.grade}|${feel}`;
    const row = tally.get(key) || { grade: v.grade, feel, count: 0 };
    row.count += 1;
    tally.set(key, row);
  }
  return [...tally.values()].sort((a, b) => rank(a) - rank(b));
}

// What a climber can vote for: the grade either side of the current one, and
// soft, plain and hard of the current grade, plus their saved vote if it sits
// outside those.
export function gradeChoices(currentGrade, myVote) {
  const n = gradeNumber(currentGrade);
  if (n === null) return [];
  const choices = [];
  if (n - 1 >= 0) choices.push({ grade: GRADES[n - 1], feel: null });
  choices.push({ grade: GRADES[n], feel: 'soft' }, { grade: GRADES[n], feel: null }, { grade: GRADES[n], feel: 'hard' });
  if (n + 1 < GRADES.length) choices.push({ grade: GRADES[n + 1], feel: null });
  if (myVote && gradeNumber(myVote.grade) !== null) {
    const mine = { grade: myVote.grade, feel: myVote.feel ?? null };
    if (!choices.some((c) => c.grade === mine.grade && c.feel === mine.feel)) choices.push(mine);
  }
  return choices.sort((a, b) => rank(a) - rank(b));
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

import { describe, it, expect } from 'vitest';
import { countedVotes, starSummary, gradeVoteCounts, gradeChoices, gradeVoteLabel, voteFor, replaceVote } from './votes';

const V = (problem_id, climber, grade, stars) => ({ id: `${problem_id}-${climber}`, problem_id, climber, grade, stars });
const T = (problem_id, sent_by) => ({ id: `${problem_id}-${sent_by}`, problem_id, sent_by });

describe('countedVotes', () => {
  it('counts a vote only while its climber has a named send of that problem', () => {
    const votes = [V('p1', 'Rob', 'V5', 4), V('p1', 'Shawn', 'V6', 5), V('p2', 'Rob', null, 3)];
    const ticks = [T('p1', 'Rob'), T('p2', 'Shawn'), T('p1', null)];
    expect(countedVotes(votes, ticks)).toEqual([votes[0]]);
  });
  it('counts the vote again once the climber logs the problem again', () => {
    const votes = [V('p1', 'Rob', 'V5', 4)];
    expect(countedVotes(votes, [])).toEqual([]);
    expect(countedVotes(votes, [T('p1', 'Rob')])).toEqual(votes);
  });
});

describe('starSummary', () => {
  const P = (rating = null) => ({ id: 'p1', rating });
  it('averages the star votes, rounding the stars to the nearest half', () => {
    expect(starSummary(P(), [V('p1', 'A', null, 4), V('p1', 'B', null, 5), V('p1', 'C', null, 4), V('p1', 'D', null, 4)]))
      .toEqual({ average: 4.25, count: 4, stars: 4.5, legacy: false });
    expect(starSummary(P(), [V('p1', 'A', null, 4), V('p1', 'B', null, 4), V('p1', 'C', null, 4), V('p1', 'D', null, 4), V('p1', 'E', null, 5)]))
      .toEqual({ average: 4.2, count: 5, stars: 4, legacy: false });
  });
  it("uses the old rating only while there are no star votes, and a grade-only vote doesn't replace it", () => {
    expect(starSummary(P(3), [V('p1', 'A', 'V4', null)])).toEqual({ average: 3, count: 0, stars: 3, legacy: true });
    expect(starSummary(P(3), [V('p1', 'A', null, 5)])).toEqual({ average: 5, count: 1, stars: 5, legacy: false });
  });
  it("ignores other problems' votes and returns null with nothing to show", () => {
    expect(starSummary(P(), [V('p2', 'A', null, 5)])).toBeNull();
  });
});

const C = (grade, feel = null) => ({ grade, feel });

describe('gradeVoteLabel', () => {
  it('says soft, plain or hard', () => {
    expect(gradeVoteLabel({ grade: 'V5', feel: 'soft' })).toBe('soft V5');
    expect(gradeVoteLabel({ grade: 'V5', feel: null })).toBe('V5');
    expect(gradeVoteLabel({ grade: 'V5' })).toBe('V5');
    expect(gradeVoteLabel({ grade: 'V5', feel: 'hard' })).toBe('hard V5');
  });
});

describe('gradeVoteCounts', () => {
  it('tallies each grade and feel, easiest first, skipping star-only and unparseable votes', () => {
    const counted = [
      V('p1', 'A', 'V4', null),
      { ...V('p1', 'B', 'V5', null), feel: 'soft' },
      V('p1', 'C', 'V5', null),
      { ...V('p1', 'D', 'V5', null), feel: null },
      { ...V('p1', 'E', 'V5', null), feel: 'hard' },
      V('p1', 'F', null, 4),
      V('p1', 'G', '6a', null),
      V('p2', 'H', 'V1', null),
    ];
    expect(gradeVoteCounts('p1', counted)).toEqual([
      { grade: 'V4', feel: null, count: 1 },
      { grade: 'V5', feel: 'soft', count: 1 },
      { grade: 'V5', feel: null, count: 2 },
      { grade: 'V5', feel: 'hard', count: 1 },
    ]);
  });
});

describe('gradeChoices', () => {
  it('offers soft, plain and hard of the current grade, with the grade either side', () => {
    expect(gradeChoices('V5', null)).toEqual([C('V4'), C('V5', 'soft'), C('V5'), C('V5', 'hard'), C('V6')]);
  });
  it('stops at the ends of the scale', () => {
    expect(gradeChoices('V0', null)).toEqual([C('V0', 'soft'), C('V0'), C('V0', 'hard'), C('V1')]);
    expect(gradeChoices('V18', null)).toEqual([C('V17'), C('V18', 'soft'), C('V18'), C('V18', 'hard')]);
  });
  it('adds a saved vote that falls outside the five, in grade order', () => {
    expect(gradeChoices('V3', C('V5', 'hard'))).toEqual([C('V2'), C('V3', 'soft'), C('V3'), C('V3', 'hard'), C('V4'), C('V5', 'hard')]);
  });
  it("doesn't duplicate a saved vote that is already among the five", () => {
    expect(gradeChoices('V5', C('V5', 'hard'))).toEqual([C('V4'), C('V5', 'soft'), C('V5'), C('V5', 'hard'), C('V6')]);
    expect(gradeChoices('V5', { grade: 'V5' })).toHaveLength(5);
  });
  it('adds nothing for a star-only vote', () => {
    expect(gradeChoices('V5', { grade: null, stars: 4 })).toHaveLength(5);
  });
  it('offers nothing for an ungraded or free-text grade', () => {
    expect(gradeChoices(null, C('V4'))).toEqual([]);
    expect(gradeChoices('6a', C('V4'))).toEqual([]);
  });
});

describe('voteFor and replaceVote', () => {
  it("finds a climber's vote and replaces or removes it", () => {
    const votes = [V('p1', 'Rob', 'V5', null), V('p1', 'Shawn', null, 4)];
    expect(voteFor(votes, 'p1', 'Rob')).toBe(votes[0]);
    expect(voteFor(votes, 'p1', undefined)).toBeNull();
    const next = V('p1', 'Rob', 'V4', 2);
    expect(replaceVote(votes, 'p1', 'Rob', next)).toEqual([votes[1], next]);
    expect(replaceVote(votes, 'p1', 'Rob', null)).toEqual([votes[1]]);
  });
});

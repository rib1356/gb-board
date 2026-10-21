import { describe, it, expect } from 'vitest';
import { weeklyProgress, progressTiles, ticklist, mostClimbed, MAX_WEEKS } from './progress';

const PROBLEMS = [
  { id: 'p1', name: 'Gaston Traverse', grade: 'V5' },
  { id: 'p2', name: 'Crimpy Corner', grade: 'V3' },
  { id: 'p3', name: 'Jug Haul', grade: 'V2' },
  { id: 'p4', name: 'Mystery', grade: '' },
];
const tick = (id, problemId, sentOn, sentBy = 'Rob', createdAt = `${sentOn}T18:00:00Z`) => ({
  id, problem_id: problemId, sent_by: sentBy, sent_on: sentOn, created_at: createdAt, flash: false,
});

describe('weeklyProgress', () => {
  it("gives a row per Mon-Sun week from your first session's week to this week, empty weeks included", () => {
    const ticks = [
      tick('t1', 'p3', '2026-09-01'), // Tue
      tick('t2', 'p2', '2026-09-03'), // Thu, same week
      tick('t3', 'p3', '2026-09-15'), // Tue, two weeks on -- a repeat
      tick('t4', 'p1', '2026-09-02', 'Shawn'),
    ];
    expect(weeklyProgress(PROBLEMS, ticks, 'Rob', '2026-09-17')).toEqual([
      { weekStart: '2026-08-31', sessions: 2, top: 3, newTicks: 2, repeats: 0, ticked: 2 },
      { weekStart: '2026-09-07', sessions: 0, top: null, newTicks: 0, repeats: 0, ticked: 2 },
      { weekStart: '2026-09-14', sessions: 1, top: 2, newTicks: 0, repeats: 1, ticked: 2 },
    ]);
  });

  it('counts a problem logged twice in a day once, and counts repeats in the hardest send', () => {
    const ticks = [
      tick('t1', 'p1', '2026-09-01', 'Rob', '2026-09-01T10:00:00Z'),
      tick('t2', 'p1', '2026-09-01', 'Rob', '2026-09-01T11:00:00Z'),
      tick('t3', 'p1', '2026-09-08'),
    ];
    const weeks = weeklyProgress(PROBLEMS, ticks, 'Rob', '2026-09-08');
    expect(weeks[0]).toMatchObject({ sessions: 1, newTicks: 1, repeats: 0, top: 5 });
    expect(weeks[1]).toMatchObject({ sessions: 1, newTicks: 0, repeats: 1, top: 5 });
  });

  it('keeps a week together across a year end', () => {
    const ticks = [tick('t1', 'p1', '2026-12-31'), tick('t2', 'p2', '2027-01-01')];
    expect(weeklyProgress(PROBLEMS, ticks, 'Rob', '2027-01-02')).toEqual([
      { weekStart: '2026-12-28', sessions: 2, top: 5, newTicks: 2, repeats: 0, ticked: 2 },
    ]);
  });

  it('shows the last 52 weeks at most, still counting older ticks in the running total', () => {
    const ticks = [tick('t1', 'p1', '2025-06-03'), tick('t2', 'p2', '2026-09-01')];
    const weeks = weeklyProgress(PROBLEMS, ticks, 'Rob', '2026-09-03');
    expect(weeks).toHaveLength(MAX_WEEKS);
    expect(weeks[0]).toMatchObject({ weekStart: '2025-09-08', ticked: 1 });
    expect(weeks[MAX_WEEKS - 1]).toMatchObject({ weekStart: '2026-08-31', newTicks: 1, ticked: 2 });
  });

  it('leaves the hardest send blank for a week of only ungraded problems', () => {
    expect(weeklyProgress(PROBLEMS, [tick('t1', 'p4', '2026-09-01')], 'Rob', '2026-09-02')).toEqual([
      { weekStart: '2026-08-31', sessions: 1, top: null, newTicks: 1, repeats: 0, ticked: 1 },
    ]);
  });

  it('ignores sends on problems no longer on the board', () => {
    expect(weeklyProgress(PROBLEMS, [tick('t1', 'p9', '2026-09-01')], 'Rob', '2026-09-02')).toEqual([]);
  });

  it("doesn't grow weeks for a send dated in the future", () => {
    const ticks = [tick('t1', 'p1', '2026-09-01'), tick('t2', 'p2', '2026-12-25')];
    const weeks = weeklyProgress(PROBLEMS, ticks, 'Rob', '2026-09-03');
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-08-31']);
  });
});

describe('progressTiles', () => {
  it("gives your hardest send ever, sessions a week over the last 28 days, and problems ticked", () => {
    const ticks = [
      tick('t1', 'p1', '2025-06-03'), // a year ago, still your hardest
      tick('t2', 'p2', '2026-09-01'),
      tick('t3', 'p3', '2026-09-08'),
      tick('t4', 'p3', '2026-09-15'),
      tick('t5', 'p2', '2026-09-30'), // in the future -- not counted in the last 28 days
    ];
    expect(progressTiles(PROBLEMS, ticks, 'Rob', '2026-09-17')).toEqual({
      hardest: 5, sessionsPerWeek: 0.8, ticked: 3, total: 4,
    });
  });

  it('has no hardest send before you send anything graded', () => {
    expect(progressTiles(PROBLEMS, [], 'Rob', '2026-09-17')).toEqual({ hardest: null, sessionsPerWeek: 0, ticked: 0, total: 4 });
  });
});

describe('ticklist', () => {
  it('counts what you have ticked at each grade that has problems, leaving out ungraded ones', () => {
    const ticks = [tick('t1', 'p2', '2026-09-01'), tick('t2', 'p4', '2026-09-01'), tick('t3', 'p1', '2026-09-02', 'Shawn')];
    expect(ticklist(PROBLEMS, ticks, 'Rob')).toEqual([
      { grade: 2, ticked: 0, total: 1 },
      { grade: 3, ticked: 1, total: 1 },
      { grade: 5, ticked: 0, total: 1 },
    ]);
  });
});

describe('mostClimbed', () => {
  it('ranks by sessions, not sends, with ties going to the most recent', () => {
    const ticks = [
      tick('t1', 'p3', '2026-09-01'), tick('t2', 'p3', '2026-09-01', 'Rob', '2026-09-01T19:00:00Z'),
      tick('t3', 'p3', '2026-09-08'),
      tick('t4', 'p2', '2026-09-01'), tick('t5', 'p2', '2026-09-10'),
      tick('t6', 'p1', '2026-09-01'),
    ];
    expect(mostClimbed(PROBLEMS, ticks, 'Rob')).toEqual([
      { id: 'p2', name: 'Crimpy Corner', grade: 'V3', sessions: 2 },
      { id: 'p3', name: 'Jug Haul', grade: 'V2', sessions: 2 },
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', sessions: 1 },
    ]);
    expect(mostClimbed(PROBLEMS, ticks, 'Rob', 1)).toHaveLength(1);
  });
});

import { describe, it, expect } from 'vitest';
import { sentProblemIds, buildPyramid } from './sends';

describe('sentProblemIds', () => {
  const TICKS = [
    { id: 't1', problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-09-01' },
    { id: 't2', problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-09-05' },
    { id: 't3', problem_id: 'p2', sent_by: 'Shawn', sent_on: '2026-09-02' },
    { id: 't4', problem_id: 'p3', sent_by: null, sent_on: '2026-08-31' },
    { id: 't5', problem_id: 'p4', sent_by: 'Rob', sent_on: '2026-09-10' },
  ];

  it("collects the problems a climber has sent, once each, ignoring everyone else's sends", () => {
    expect([...sentProblemIds(TICKS, 'Rob')].sort()).toEqual(['p1', 'p4']);
    expect([...sentProblemIds(TICKS, 'Shawn')]).toEqual(['p2']);
  });

  it('gives nobody credit for sends logged without a name', () => {
    expect(sentProblemIds(TICKS, null).size).toBe(0);
    expect(sentProblemIds(TICKS, '').size).toBe(0);
  });
});

describe('buildPyramid', () => {
  // Newest first, as listProblems returns them.
  const PROBLEMS = [
    { id: 'p1', name: 'Gaston Traverse', grade: 'V5' },
    { id: 'p2', name: 'Crimpy Corner', grade: 'V3' },
    { id: 'p3', name: 'Tension Sucks', grade: 'V10' },
    { id: 'p4', name: 'Jug Haul', grade: 'V3' },
    { id: 'p5', name: 'Mystery', grade: '' },
    { id: 'p6', name: 'Slab Dance', grade: 'V3' },
  ];

  const shape = (rows) => rows.map((r) => [r.grade, r.problems.map((p) => `${p.name}${p.sent ? ' ✓' : ''}`)]);

  it('rows up only the grades on the board, hardest first, leaving ungraded problems out', () => {
    expect(buildPyramid(PROBLEMS, [], 'Rob').map((r) => r.grade)).toEqual(['V10', 'V5', 'V3']);
  });

  it("marks the climber's sent problems, putting them first in their row", () => {
    const ticks = [
      { id: 't1', problem_id: 'p6', sent_by: 'Rob', sent_on: '2026-09-01' },
      { id: 't2', problem_id: 'p6', sent_by: 'Rob', sent_on: '2026-09-04' },
      { id: 't3', problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-09-02' },
    ];
    expect(shape(buildPyramid(PROBLEMS, ticks, 'Rob'))).toEqual([
      ['V10', ['Tension Sucks']],
      ['V5', ['Gaston Traverse ✓']],
      ['V3', ['Slab Dance ✓', 'Crimpy Corner', 'Jug Haul']],
    ]);
  });

  it("ignores other climbers' sends and sends with no name", () => {
    const ticks = [
      { id: 't1', problem_id: 'p1', sent_by: 'Shawn', sent_on: '2026-09-01' },
      { id: 't2', problem_id: 'p2', sent_by: null, sent_on: '2026-08-31' },
    ];
    expect(buildPyramid(PROBLEMS, ticks, 'Rob').flatMap((r) => r.problems).filter((p) => p.sent)).toEqual([]);
  });
});

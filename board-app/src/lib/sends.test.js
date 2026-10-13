import { describe, it, expect } from 'vitest';
import { sentProblemIds } from './sends';

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

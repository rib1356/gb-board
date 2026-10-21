import { describe, it, expect } from 'vitest';
import {
  crewBoard, firstAscents, latestFAs, faTally, classics, popularLately, openProjects, leastClimbedLately,
  daysAgoLabel, openLabel,
} from './boardStats';

const P = (id, name, grade, extra = {}) => ({ id, name, grade, setter: 'Rob', rating: null, created_at: '2026-09-01T12:00:00Z', ...extra });
const T = (id, problemId, sentBy, sentOn, extra = {}) => ({
  id, problem_id: problemId, sent_by: sentBy, sent_on: sentOn, created_at: `${sentOn}T18:00:00Z`, flash: false, ...extra,
});

describe('crewBoard', () => {
  const PROBLEMS = [P('p1', 'Gaston Traverse', 'V5'), P('p2', 'Crimpy Corner', 'V3'), P('p3', 'Jug Haul', 'V2')];

  it("counts this month's problems once a day, new ticks, flashed new ticks and the hardest send", () => {
    const ticks = [
      T('t1', 'p1', 'Rob', '2026-09-28'), // last month: Rob's first send of p1
      T('t2', 'p1', 'Rob', '2026-10-02', { flash: true }), // a repeat -- its flash doesn't count
      T('t3', 'p1', 'Rob', '2026-10-02', { created_at: '2026-10-02T19:00:00Z' }), // same day, counted once
      T('t4', 'p2', 'Rob', '2026-10-03', { flash: true }),
      T('t5', 'p3', 'Shawn', '2026-10-05'),
      T('t6', 'p2', 'Shawn', '2026-10-06'),
      T('t7', 'p1', 'Shawn', '2026-10-06'),
      T('t8', 'p3', null, '2026-10-07'), // no name, so nobody's
    ];
    expect(crewBoard(PROBLEMS, ticks, '2026-10')).toEqual([
      { name: 'Shawn', problems: 3, newTicks: 3, flashes: 0, top: 5 },
      { name: 'Rob', problems: 2, newTicks: 1, flashes: 1, top: 5 },
    ]);
  });

  it('breaks a tie on new ticks by problems, then by name', () => {
    const ticks = [
      T('t1', 'p1', 'Bob', '2026-10-01'), T('t2', 'p1', 'Bob', '2026-10-02'),
      T('t3', 'p2', 'Alice', '2026-10-01'),
      T('t4', 'p3', 'Cara', '2026-10-01'),
    ];
    expect(crewBoard(PROBLEMS, ticks, '2026-10').map((r) => r.name)).toEqual(['Bob', 'Alice', 'Cara']);
  });

  it('is empty for a month with no named sends', () => {
    expect(crewBoard(PROBLEMS, [T('t1', 'p1', 'Rob', '2026-10-02')], '2026-11')).toEqual([]);
  });
});

describe('firstAscents', () => {
  const PROBLEMS = [P('p1', 'Gaston Traverse', 'V5'), P('p2', 'Crimpy Corner', 'V3'), P('p3', 'Jug Haul', 'V2')];

  it('gives the FA to the first send, breaking a same-day tie by whichever was logged first', () => {
    const ticks = [
      T('t1', 'p1', 'Shawn', '2026-09-02'),
      T('t2', 'p1', 'Rob', '2026-09-02', { created_at: '2026-09-02T09:00:00Z' }),
      T('t3', 'p1', 'Rob', '2026-09-10'),
      T('t4', 'p1', 'Will', '2026-09-11'),
    ];
    expect(firstAscents(PROBLEMS, ticks).get('p1')).toEqual({
      climber: 'Rob', date: '2026-09-02', loggedAt: '2026-09-02T09:00:00Z',
    });
  });

  it('gives nobody the FA when the first send was logged without a name', () => {
    const fas = firstAscents(PROBLEMS, [T('t1', 'p2', null, '2026-08-30'), T('t2', 'p2', 'Rob', '2026-09-01')]);
    expect(fas.get('p2')).toBeNull();
  });

  it('leaves out problems never sent, and sends on problems no longer on the board', () => {
    const fas = firstAscents(PROBLEMS, [T('t1', 'p9', 'Rob', '2026-09-01')]);
    expect(fas.has('p3')).toBe(false);
    expect(fas.has('p9')).toBe(false);
  });
});

describe('latestFAs and faTally', () => {
  const PROBLEMS = [P('p1', 'Gaston Traverse', 'V5'), P('p2', 'Crimpy Corner', 'V3'), P('p3', 'Jug Haul', 'V2'), P('p4', 'Old One', 'V1')];
  const ticks = [
    T('t1', 'p1', 'Rob', '2026-09-01'),
    T('t2', 'p2', 'Shawn', '2026-10-01'),
    T('t3', 'p3', 'Rob', '2026-10-01', { created_at: '2026-10-01T20:00:00Z' }),
    T('t4', 'p4', null, '2026-08-01'),
  ];

  it('lists the most recent FAs first, leaving out ones nobody got', () => {
    expect(latestFAs(PROBLEMS, ticks).map((f) => [f.name, f.climber])).toEqual([
      ['Jug Haul', 'Rob'], ['Crimpy Corner', 'Shawn'], ['Gaston Traverse', 'Rob'],
    ]);
    expect(latestFAs(PROBLEMS, ticks, 1)).toHaveLength(1);
  });

  it('counts FAs per climber, most first', () => {
    expect(faTally(PROBLEMS, ticks)).toEqual([{ name: 'Rob', count: 2 }, { name: 'Shawn', count: 1 }]);
  });
});

describe('classics', () => {
  it('ranks rated problems by stars, then by different climbers, then by name', () => {
    const PROBLEMS = [
      P('p1', 'Zed', 'V5', { rating: 5 }), P('p2', 'Alpha', 'V4', { rating: 5 }),
      P('p3', 'Mid', 'V3', { rating: 4 }), P('p4', 'Unrated', 'V2'),
    ];
    const ticks = [T('t1', 'p1', 'Rob', '2026-09-01'), T('t2', 'p1', 'Rob', '2026-09-02'), T('t3', 'p1', 'Shawn', '2026-09-03'), T('t4', 'p4', 'Rob', '2026-09-03')];
    expect(classics(PROBLEMS, ticks)).toEqual([
      { id: 'p1', name: 'Zed', grade: 'V5', rating: 5, ascents: 2 },
      { id: 'p2', name: 'Alpha', grade: 'V4', rating: 5, ascents: 0 },
      { id: 'p3', name: 'Mid', grade: 'V3', rating: 4, ascents: 0 },
    ]);
  });
});

describe('popularLately', () => {
  it('ranks the last 30 days by different climbers, then sends, then the latest send', () => {
    const PROBLEMS = [P('p1', 'A', 'V1'), P('p2', 'B', 'V2'), P('p3', 'C', 'V3'), P('p4', 'D', 'V4')];
    const ticks = [
      T('t1', 'p1', 'Rob', '2026-10-21'), T('t2', 'p1', 'Shawn', '2026-09-22'), // 30 days ago, today included
      T('t3', 'p2', 'Rob', '2026-10-01'), T('t4', 'p2', 'Rob', '2026-10-02'),
      T('t5', 'p3', 'Will', '2026-10-05'),
      T('t6', 'p4', 'Rob', '2026-09-21'), T('t7', 'p4', 'Shawn', '2026-09-20'), // too long ago
      T('t8', 'p4', null, '2026-10-20'), // no name -- not a climber
    ];
    expect(popularLately(PROBLEMS, ticks, '2026-10-21').map((p) => [p.name, p.climbers])).toEqual([
      ['A', 2], ['B', 1], ['C', 1],
    ]);
  });
});

describe('openProjects', () => {
  it('lists problems nobody has sent, hardest first, ungraded last, then longest open', () => {
    const PROBLEMS = [
      P('p1', 'Sent', 'V6'),
      P('p2', 'Anon sent', 'V6'),
      P('p3', 'Hard', 'V5', { created_at: '2026-10-01T12:00:00Z' }),
      P('p4', 'Hard older', 'V5', { created_at: '2026-09-17T12:00:00Z', setter: 'Shawn' }),
      P('p5', 'Ungraded', '', { created_at: '2026-08-01T12:00:00Z' }),
      P('p6', 'Easy', 'V2', { created_at: '2026-10-20T12:00:00Z' }),
    ];
    const ticks = [T('t1', 'p1', 'Rob', '2026-10-01'), T('t2', 'p2', null, '2026-10-01')];
    expect(openProjects(PROBLEMS, ticks, '2026-10-21')).toEqual([
      { id: 'p4', name: 'Hard older', grade: 'V5', setter: 'Shawn', daysOpen: 34 },
      { id: 'p3', name: 'Hard', grade: 'V5', setter: 'Rob', daysOpen: 20 },
      { id: 'p6', name: 'Easy', grade: 'V2', setter: 'Rob', daysOpen: 1 },
      { id: 'p5', name: 'Ungraded', grade: '', setter: 'Rob', daysOpen: 81 },
    ]);
  });

  it("counts days open from the phone's own date, and copes with no created_at", () => {
    const PROBLEMS = [
      P('p1', 'Just after midnight', 'V3', { created_at: new Date(2026, 9, 21, 0, 15).toISOString() }),
      P('p2', 'Just before', 'V3', { created_at: new Date(2026, 9, 20, 23, 45).toISOString() }),
      P('p3', 'Unknown', 'V3', { created_at: undefined }),
    ];
    const byName = Object.fromEntries(openProjects(PROBLEMS, [], '2026-10-21').map((p) => [p.name, p.daysOpen]));
    expect(byName).toEqual({ 'Just after midnight': 0, 'Just before': 1, Unknown: null });
  });
});

describe('leastClimbedLately', () => {
  it("lists sent problems by how long it's been since a send, oldest first", () => {
    const PROBLEMS = [P('p1', 'A', 'V1'), P('p2', 'B', 'V2'), P('p3', 'Never', 'V3')];
    const ticks = [T('t1', 'p1', 'Rob', '2026-10-01'), T('t2', 'p1', 'Rob', '2026-10-20'), T('t3', 'p2', null, '2026-10-13')];
    expect(leastClimbedLately(PROBLEMS, ticks, '2026-10-21')).toEqual([
      { id: 'p2', name: 'B', grade: 'V2', lastSent: '2026-10-13', daysAgo: 8 },
      { id: 'p1', name: 'A', grade: 'V1', lastSent: '2026-10-20', daysAgo: 1 },
    ]);
  });
});

describe('labels', () => {
  it('reads naturally for 0, 1 and many', () => {
    expect([0, 1, 8].map(daysAgoLabel)).toEqual(['today', 'yesterday', '8 days ago']);
    expect([0, 1, 34].map(openLabel)).toEqual(['set today', 'open 1 day', 'open 34 days']);
  });
});

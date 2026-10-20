import { describe, it, expect } from 'vitest';
import { sentProblemIds, firstSendIds, buildLogbook } from './sends';

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

describe('firstSendIds', () => {
  it("picks each climber's earliest send on the problem", () => {
    const ticks = [
      { id: 't3', sent_by: 'Rob', sent_on: '2026-09-10', created_at: '2026-09-10T10:00:00Z' },
      { id: 't2', sent_by: 'Shawn', sent_on: '2026-09-05', created_at: '2026-09-05T10:00:00Z' },
      { id: 't1', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-12T10:00:00Z' },
    ];
    expect([...firstSendIds(ticks)].sort()).toEqual(['t1', 't2']);
  });

  it('breaks a same-day tie by whichever was logged first', () => {
    const ticks = [
      { id: 't2', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-01T15:00:00Z' },
      { id: 't1', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-01T09:00:00Z' },
    ];
    expect([...firstSendIds(ticks)]).toEqual(['t1']);
  });

  it('leaves out sends with no name, since they belong to nobody', () => {
    expect(firstSendIds([{ id: 't1', sent_by: null, sent_on: '2026-08-31', created_at: '2026-08-31T10:00:00Z' }]).size).toBe(0);
  });
});

describe('buildLogbook', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Gaston Traverse', grade: 'V5' },
    { id: 'p2', name: 'Crimpy Corner', grade: 'V3' },
    { id: 'p3', name: 'Jug Haul', grade: 'V2' },
  ];
  const tick = (id, problemId, sentBy, sentOn, createdAt, flash = false) => ({
    id, problem_id: problemId, sent_by: sentBy, sent_on: sentOn, created_at: createdAt, flash,
  });

  const names = (days) => days.map((d) => [d.date, d.problems.map((p) => p.name)]);
  const firstSends = (days) => days.map((d) => [d.date, d.problems.map((p) => [p.name, p.firstSend])]);
  const flashes = (days) => days.map((d) => [d.date, d.problems.map((p) => [p.name, p.flashed])]);

  it("groups the climber's sends by day, newest first, each day in the order they were logged", () => {
    const ticks = [
      tick('t2', 'p1', 'Rob', '2026-09-01', '2026-09-01T18:30:00Z'),
      tick('t1', 'p2', 'Rob', '2026-09-01', '2026-09-01T18:00:00Z'),
      tick('t3', 'p3', 'Rob', '2026-09-08', '2026-09-08T19:00:00Z'),
      tick('t4', 'p3', 'Shawn', '2026-09-05', '2026-09-05T19:00:00Z'),
      tick('t5', 'p1', null, '2026-09-03', '2026-09-03T19:00:00Z'),
    ];
    expect(names(buildLogbook(PROBLEMS, ticks, 'Rob'))).toEqual([
      ['2026-09-08', ['Jug Haul']],
      ['2026-09-01', ['Crimpy Corner', 'Gaston Traverse']],
    ]);
  });

  it("carries each problem's grade", () => {
    const ticks = [tick('t1', 'p1', 'Rob', '2026-09-01', '2026-09-01T18:00:00Z')];
    expect(buildLogbook(PROBLEMS, ticks, 'Rob')[0].problems[0].grade).toBe('V5');
  });

  it("marks the climber's own first send of a problem, even when someone else sent it first", () => {
    const ticks = [
      tick('t1', 'p1', 'Rob', '2026-09-01', '2026-09-01T10:00:00Z'),
      tick('t2', 'p1', 'Rob', '2026-09-08', '2026-09-08T10:00:00Z'),
      tick('t3', 'p2', 'Shawn', '2026-09-02', '2026-09-02T10:00:00Z'),
      tick('t4', 'p2', 'Rob', '2026-09-08', '2026-09-08T11:00:00Z'),
    ];
    expect(firstSends(buildLogbook(PROBLEMS, ticks, 'Rob'))).toEqual([
      ['2026-09-08', [['Gaston Traverse', false], ['Crimpy Corner', true]]],
      ['2026-09-01', [['Gaston Traverse', true]]],
    ]);
  });

  it('moves the first send to an earlier day when a send is backdated', () => {
    const ticks = [
      tick('t1', 'p1', 'Rob', '2026-09-08', '2026-09-08T10:00:00Z'),
      tick('t2', 'p1', 'Rob', '2026-09-01', '2026-09-10T10:00:00Z'),
    ];
    expect(firstSends(buildLogbook(PROBLEMS, ticks, 'Rob'))).toEqual([
      ['2026-09-08', [['Gaston Traverse', false]]],
      ['2026-09-01', [['Gaston Traverse', true]]],
    ]);
  });

  it('marks a problem flashed only on a first send that was logged as a flash', () => {
    const ticks = [
      tick('t1', 'p1', 'Rob', '2026-09-01', '2026-09-01T10:00:00Z', true),
      tick('t2', 'p1', 'Rob', '2026-09-08', '2026-09-08T10:00:00Z'),
      tick('t3', 'p2', 'Rob', '2026-09-01', '2026-09-01T11:00:00Z'),
      tick('t4', 'p2', 'Rob', '2026-09-08', '2026-09-08T11:00:00Z', true),
    ];
    expect(flashes(buildLogbook(PROBLEMS, ticks, 'Rob'))).toEqual([
      ['2026-09-08', [['Gaston Traverse', false], ['Crimpy Corner', false]]],
      ['2026-09-01', [['Gaston Traverse', true], ['Crimpy Corner', false]]],
    ]);
  });

  it('shows a problem logged twice in one day once, still marked as the first send', () => {
    const ticks = [
      tick('t2', 'p1', 'Rob', '2026-09-01', '2026-09-01T11:00:00Z'),
      tick('t1', 'p1', 'Rob', '2026-09-01', '2026-09-01T10:00:00Z'),
      tick('t3', 'p2', 'Rob', '2026-09-01', '2026-09-01T10:30:00Z'),
    ];
    expect(firstSends(buildLogbook(PROBLEMS, ticks, 'Rob'))).toEqual([
      ['2026-09-01', [['Gaston Traverse', true], ['Crimpy Corner', true]]],
    ]);
  });

  it('leaves out sends on problems no longer on the board, dropping a day with nothing else', () => {
    const ticks = [
      tick('t1', 'p9', 'Rob', '2026-09-05', '2026-09-05T10:00:00Z'),
      tick('t2', 'p1', 'Rob', '2026-09-01', '2026-09-01T10:00:00Z'),
    ];
    expect(names(buildLogbook(PROBLEMS, ticks, 'Rob'))).toEqual([['2026-09-01', ['Gaston Traverse']]]);
  });
});

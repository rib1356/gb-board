import { describe, it, expect } from 'vitest';
import { COLD_AFTER_DAYS, workedOn, yourProjects, sessionsToSend } from './projects';

const today = '2026-11-25';
const P1 = { id: 'p1', name: 'Hyperbole', grade: 'V7' };
const P2 = { id: 'p2', name: 'Crimp Lord', grade: 'V6' };
const P3 = { id: 'p3', name: 'Slab', grade: 'V3' };
const PROBLEMS = [P1, P2, P3];

const row = (problemId, climber, worked_on) => ({ problem_id: problemId, climber, worked_on });
const send = (problemId, sent_by, sent_on, created_at = `${sent_on}T18:00:00Z`) => ({ problem_id: problemId, sent_by, sent_on, created_at });

it('goes cold after 28 days', () => {
  expect(COLD_AFTER_DAYS).toBe(28);
});

describe('yourProjects', () => {
  it('makes a problem with your sessions and no send by you a project', () => {
    const sessions = [row('p1', 'Rob', '2026-11-20'), row('p1', 'Rob', '2026-11-24')];
    expect(yourProjects(PROBLEMS, sessions, [], 'Rob', today)).toEqual({
      active: [{ problem: P1, sessions: 2, firstWorked: '2026-11-20', lastWorked: '2026-11-24' }],
      cold: [],
    });
  });

  it('sorts active projects by last worked, newest first', () => {
    const sessions = [row('p1', 'Rob', '2026-11-20'), row('p2', 'Rob', '2026-11-24'), row('p3', 'Rob', '2026-11-22')];
    const { active } = yourProjects(PROBLEMS, sessions, [], 'Rob', today);
    expect(active.map((p) => p.problem.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('moves a project to cold at 28 days and keeps it active at 27', () => {
    const sessions = [row('p1', 'Rob', '2026-10-28'), row('p2', 'Rob', '2026-10-29'), row('p3', 'Rob', '2026-09-01')];
    const { active, cold } = yourProjects(PROBLEMS, sessions, [], 'Rob', today);
    expect(active.map((p) => p.problem.id)).toEqual(['p2']);
    expect(cold.map((p) => p.problem.id)).toEqual(['p1', 'p3']);
  });

  it('leaves out a problem you have sent', () => {
    const sessions = [row('p1', 'Rob', '2026-11-20'), row('p2', 'Rob', '2026-11-21')];
    const { active } = yourProjects(PROBLEMS, sessions, [send('p1', 'Rob', '2026-11-22')], 'Rob', today);
    expect(active.map((p) => p.problem.id)).toEqual(['p2']);
  });

  it("ignores other climbers' rows and sends", () => {
    const sessions = [row('p1', 'Rob', '2026-11-20'), row('p2', 'Shawn', '2026-11-21')];
    const ticks = [send('p1', 'Shawn', '2026-11-22')];
    const { active, cold } = yourProjects(PROBLEMS, sessions, ticks, 'Rob', today);
    expect(active).toEqual([{ problem: P1, sessions: 1, firstWorked: '2026-11-20', lastWorked: '2026-11-20' }]);
    expect(cold).toEqual([]);
  });

  it('leaves out a problem no longer on the board', () => {
    const sessions = [row('gone', 'Rob', '2026-11-20')];
    expect(yourProjects(PROBLEMS, sessions, [], 'Rob', today)).toEqual({ active: [], cold: [] });
  });

  it('makes a problem a project again once your only send is gone', () => {
    const sessions = [row('p1', 'Rob', '2026-11-20')];
    expect(yourProjects(PROBLEMS, sessions, [send('p1', 'Rob', '2026-11-22')], 'Rob', today).active).toEqual([]);
    expect(yourProjects(PROBLEMS, sessions, [], 'Rob', today).active.map((p) => p.problem.id)).toEqual(['p1']);
  });

  it('has no projects with nobody picked', () => {
    expect(yourProjects(PROBLEMS, [row('p1', 'Rob', '2026-11-20')], [], null, today)).toEqual({ active: [], cold: [] });
  });
});

describe('sessionsToSend', () => {
  it('counts session days up to and including the first send day', () => {
    const sessions = [row('p1', 'Rob', '2026-11-10'), row('p1', 'Rob', '2026-11-14'), row('p1', 'Rob', '2026-11-20')];
    expect(sessionsToSend(sessions, [send('p1', 'Rob', '2026-11-22')], 'Rob').get('p1')).toBe(4);
  });

  it('does not double count a session on the send day', () => {
    const sessions = [row('p1', 'Rob', '2026-11-10'), row('p1', 'Rob', '2026-11-22')];
    expect(sessionsToSend(sessions, [send('p1', 'Rob', '2026-11-22')], 'Rob').get('p1')).toBe(2);
  });

  it('counts 1 when you tapped and sent the same day', () => {
    const sessions = [row('p1', 'Rob', '2026-11-22')];
    expect(sessionsToSend(sessions, [send('p1', 'Rob', '2026-11-22')], 'Rob').get('p1')).toBe(1);
  });

  it('has no entry for a send with no sessions before it', () => {
    expect(sessionsToSend([], [send('p1', 'Rob', '2026-11-22')], 'Rob').has('p1')).toBe(false);
  });

  it('ignores rows after a backdated first send', () => {
    const sessions = [row('p1', 'Rob', '2026-11-20'), row('p1', 'Rob', '2026-11-24')];
    const ticks = [send('p1', 'Rob', '2026-11-25'), send('p1', 'Rob', '2026-11-18')];
    expect(sessionsToSend(sessions, ticks, 'Rob').has('p1')).toBe(false);
  });

  it('uses the earliest send, ties by created_at', () => {
    const sessions = [row('p1', 'Rob', '2026-11-10'), row('p1', 'Rob', '2026-11-14')];
    const ticks = [
      send('p1', 'Rob', '2026-11-20', '2026-11-20T19:00:00Z'),
      send('p1', 'Rob', '2026-11-14', '2026-11-24T10:00:00Z'),
      send('p1', 'Rob', '2026-11-14', '2026-11-14T10:00:00Z'),
    ];
    expect(sessionsToSend(sessions, ticks, 'Rob').get('p1')).toBe(2);
  });

  it("ignores other climbers' rows and sends", () => {
    const sessions = [row('p1', 'Rob', '2026-11-10'), row('p1', 'Shawn', '2026-11-12'), row('p1', 'Shawn', '2026-11-13')];
    const ticks = [send('p1', 'Shawn', '2026-11-14'), send('p1', 'Rob', '2026-11-20')];
    const rob = sessionsToSend(sessions, ticks, 'Rob');
    expect(rob.get('p1')).toBe(2);
    expect(sessionsToSend(sessions, ticks, 'Shawn').get('p1')).toBe(3);
  });

  it('is empty with nobody picked', () => {
    expect(sessionsToSend([row('p1', 'Rob', '2026-11-10')], [send('p1', 'Rob', '2026-11-20')], null).size).toBe(0);
  });
});

it('workedOn is true only for that problem, climber and date', () => {
  const sessions = [row('p1', 'Rob', '2026-11-25')];
  expect(workedOn(sessions, 'p1', 'Rob', '2026-11-25')).toBe(true);
  expect(workedOn(sessions, 'p2', 'Rob', '2026-11-25')).toBe(false);
  expect(workedOn(sessions, 'p1', 'Shawn', '2026-11-25')).toBe(false);
  expect(workedOn(sessions, 'p1', 'Rob', '2026-11-24')).toBe(false);
});

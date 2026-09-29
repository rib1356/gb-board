import { describe, it, expect } from 'vitest';
import { recencyWeight, rollLadder, rerollRung, canReroll, nextUnsentIndex, sessionPayload } from './warmup';

const TODAY = '2026-09-29';
const P = (id, grade, send_count = 1, last_sent_on = '2026-09-01') => ({ id, name: id, grade, send_count, last_sent_on });
// Deterministic rng: returns the given values in turn.
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

describe('recencyWeight', () => {
  it('grows with days since last climbed, capped at 60 days', () => {
    expect(recencyWeight(P('a', 'V2', 1, '2026-09-28'), TODAY)).toBe(2);
    expect(recencyWeight(P('a', 'V2', 1, '2026-09-19'), TODAY)).toBe(11);
    expect(recencyWeight(P('a', 'V2', 1, '2026-01-01'), TODAY)).toBe(61);
  });
  it('treats a problem with no send date as maximally fresh', () => {
    expect(recencyWeight(P('a', 'V2', 0, null), TODAY)).toBe(61);
  });
});

describe('rollLadder', () => {
  it('resolves fixed rungs to their problems', () => {
    const problems = [P('a', 'V1')];
    const rolled = rollLadder([{ grade: 'V1', problemId: 'a' }], problems, { today: TODAY });
    expect(rolled).toEqual([{ grade: 'V1', random: false, problem: problems[0], status: 'ok' }]);
  });

  it('marks a fixed rung whose problem is gone as removed', () => {
    const rolled = rollLadder([{ grade: 'V1', problemId: 'gone' }], [], { today: TODAY });
    expect(rolled[0]).toMatchObject({ problem: null, status: 'removed' });
  });

  it('never picks a problem that is already a fixed rung', () => {
    const problems = [P('a', 'V2'), P('b', 'V2')];
    const rolled = rollLadder(
      [{ grade: 'V2', problemId: null }, { grade: 'V2', problemId: 'a' }],
      problems, { today: TODAY, rng: seq(0) },
    );
    expect(rolled[0].problem.id).toBe('b');
  });

  it('never picks the same problem for two random slots', () => {
    const problems = [P('a', 'V2')];
    const rolled = rollLadder(
      [{ grade: 'V2', problemId: null }, { grade: 'V2', problemId: null }],
      problems, { today: TODAY, rng: seq(0) },
    );
    expect(rolled[0].problem.id).toBe('a');
    expect(rolled[1]).toMatchObject({ problem: null, status: 'no-problems' });
  });

  it('prefers sent problems and only falls back to unsent ones when none are left', () => {
    const problems = [P('unsent', 'V2', 0, null), P('sent', 'V2')];
    const rolled = rollLadder(
      [{ grade: 'V2', problemId: null }, { grade: 'V2', problemId: null }],
      problems, { today: TODAY, rng: seq(0) },
    );
    expect(rolled[0]).toMatchObject({ status: 'ok' });
    expect(rolled[0].problem.id).toBe('sent');
    expect(rolled[1]).toMatchObject({ status: 'unsent-fallback' });
    expect(rolled[1].problem.id).toBe('unsent');
  });

  it('only draws from the exact grade', () => {
    const rolled = rollLadder([{ grade: 'V3', problemId: null }], [P('a', 'V2')], { today: TODAY });
    expect(rolled[0]).toMatchObject({ problem: null, status: 'no-problems' });
  });

  it('weights the pick toward problems not climbed in a while', () => {
    // weights: recent = 2 (yesterday), old = 61 (capped). Total 63.
    const problems = [P('recent', 'V2', 1, '2026-09-28'), P('old', 'V2', 1, '2026-01-01')];
    const rung = [{ grade: 'V2', problemId: null }];
    // rng 0.02 * 63 = 1.26 < 2 -> recent; rng 0.5 -> old.
    expect(rollLadder(rung, problems, { today: TODAY, rng: seq(0.02) })[0].problem.id).toBe('recent');
    expect(rollLadder(rung, problems, { today: TODAY, rng: seq(0.5) })[0].problem.id).toBe('old');
  });
});

describe('rerollRung / canReroll', () => {
  const problems = [P('a', 'V2'), P('b', 'V2'), P('c', 'V3')];

  it('re-picks a random rung, excluding its current pick and the rest of the ladder', () => {
    const rolled = rollLadder(
      [{ grade: 'V2', problemId: null }, { grade: 'V3', problemId: 'c' }],
      problems, { today: TODAY, rng: seq(0) },
    );
    expect(rolled[0].problem.id).toBe('a');
    const rerolled = rerollRung(rolled, 0, problems, { today: TODAY, rng: seq(0) });
    expect(rerolled[0].problem.id).toBe('b');
    expect(rerolled[1]).toBe(rolled[1]);
  });

  it('cannot re-roll when nothing else qualifies, or when the rung is fixed', () => {
    const only = [P('a', 'V2'), P('c', 'V3')];
    const rolled = rollLadder(
      [{ grade: 'V2', problemId: null }, { grade: 'V3', problemId: 'c' }],
      only, { today: TODAY, rng: seq(0) },
    );
    expect(canReroll(rolled, 0, only)).toBe(false);
    expect(canReroll(rolled, 1, only)).toBe(false);
    expect(rerollRung(rolled, 0, only, { today: TODAY })).toBe(rolled);
  });

  it('can re-roll when another problem at the grade is free', () => {
    const rolled = rollLadder([{ grade: 'V2', problemId: null }], problems, { today: TODAY, rng: seq(0) });
    expect(canReroll(rolled, 0, problems)).toBe(true);
  });
});

describe('nextUnsentIndex', () => {
  const rolled = [
    { problem: { id: 'a' } }, { problem: null }, { problem: { id: 'b' } }, { problem: { id: 'c' } },
  ];
  it('finds the next climbable unsent rung after the given index', () => {
    expect(nextUnsentIndex(rolled, [], -1)).toBe(0);
    expect(nextUnsentIndex(rolled, ['a'], 0)).toBe(2);
  });
  it('wraps around to earlier skipped rungs', () => {
    expect(nextUnsentIndex(rolled, ['c'], 3)).toBe(0);
  });
  it('returns -1 when everything climbable is sent', () => {
    expect(nextUnsentIndex(rolled, ['a', 'b', 'c'], 2)).toBe(-1);
  });
});

describe('sessionPayload', () => {
  it('lists climbable rungs in ladder order and the sent subset in the same order', () => {
    const rolled = [{ problem: { id: 'a' } }, { problem: null }, { problem: { id: 'b' } }, { problem: { id: 'c' } }];
    expect(sessionPayload(rolled, ['c', 'a'])).toEqual({ problemIds: ['a', 'b', 'c'], sentIds: ['a', 'c'] });
  });
});

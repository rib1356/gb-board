import { describe, it, expect } from 'vitest';
import { sortAndFilterProblems } from './problemList';

// Input order mirrors listProblems(): newest first.
const PROBLEMS = [
  { id: 'a', grade: 'V3', send_count: 2 },
  { id: 'b', grade: 'V10', send_count: 0 },
  { id: 'c', grade: '', send_count: 0 },
  { id: 'd', grade: 'V9', send_count: 1 },
  { id: 'e', grade: 'V3', send_count: 0 },
  { id: 'f', grade: null },
];

const ids = (list) => list.map((p) => p.id);

describe('sortAndFilterProblems', () => {
  it('keeps the newest-first order by default', () => {
    expect(ids(sortAndFilterProblems(PROBLEMS, { sort: 'newest' }))).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('sorts easiest first, comparing grades numerically, with ungraded problems last', () => {
    expect(ids(sortAndFilterProblems(PROBLEMS, { sort: 'grade-asc' }))).toEqual(['a', 'e', 'd', 'b', 'c', 'f']);
  });

  it('sorts hardest first, still with ungraded problems last', () => {
    expect(ids(sortAndFilterProblems(PROBLEMS, { sort: 'grade-desc' }))).toEqual(['b', 'd', 'a', 'e', 'c', 'f']);
  });

  it('keeps newest first among problems at the same grade', () => {
    const sorted = ids(sortAndFilterProblems(PROBLEMS, { sort: 'grade-desc' }));
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('e'));
  });

  it('shows only problems nobody has sent when unsentOnly is set', () => {
    expect(ids(sortAndFilterProblems(PROBLEMS, { sort: 'grade-asc', unsentOnly: true }))).toEqual(['e', 'b', 'c', 'f']);
  });

  it('does not mutate the input list', () => {
    const copy = [...PROBLEMS];
    sortAndFilterProblems(PROBLEMS, { sort: 'grade-desc' });
    expect(PROBLEMS).toEqual(copy);
  });
});

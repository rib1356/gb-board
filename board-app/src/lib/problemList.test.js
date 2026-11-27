import { describe, it, expect } from 'vitest';
import { sortAndFilterProblems, applySend, gradeOf, gradeLabel, matchesSearch } from './problemList';

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

  it("hides only the given climber's sent problems, whatever the board-wide count says", () => {
    const sentIds = new Set(['b', 'e']);
    expect(ids(sortAndFilterProblems(PROBLEMS, { unsentOnly: true, sentIds }))).toEqual(['a', 'c', 'd', 'f']);
  });

  it('does not mutate the input list', () => {
    const copy = [...PROBLEMS];
    sortAndFilterProblems(PROBLEMS, { sort: 'grade-desc' });
    expect(PROBLEMS).toEqual(copy);
  });
});

describe('applySend', () => {
  it('bumps send_count and keeps the latest last_sent_on for that problem only', () => {
    const list = [
      { id: 'a', send_count: 1, last_sent_on: '2026-09-20' },
      { id: 'b', send_count: 0, last_sent_on: null },
    ];
    expect(applySend(list, 'a', '2026-09-29')).toEqual([
      { id: 'a', send_count: 2, last_sent_on: '2026-09-29' },
      { id: 'b', send_count: 0, last_sent_on: null },
    ]);
    expect(applySend(list, 'a', '2026-09-01')[0].last_sent_on).toBe('2026-09-20');
    expect(applySend(list, 'b', '2026-09-29')[1]).toEqual({ id: 'b', send_count: 1, last_sent_on: '2026-09-29' });
  });
});

describe('gradeOf and gradeLabel', () => {
  it('prefers the shown grade and marks a provisional one', () => {
    expect(gradeOf({ grade: '', shownGrade: 'V5' })).toBe('V5');
    expect(gradeOf({ grade: 'V3' })).toBe('V3');
    expect(gradeLabel({ grade: '', shownGrade: 'V5', gradeProvisional: true })).toBe('V5?');
    expect(gradeLabel({ grade: 'V3', shownGrade: 'V3', gradeProvisional: false })).toBe('V3');
    expect(gradeLabel({ grade: null })).toBe('');
  });
});

describe('sorting with provisional grades', () => {
  it('sorts a provisional problem at its provisional grade, and an ungraded one with no votes last', () => {
    const list = [
      { id: 'none', grade: '', shownGrade: '', gradeProvisional: false },
      { id: 'v7', grade: 'V7', shownGrade: 'V7', gradeProvisional: false },
      { id: 'v5?', grade: '', shownGrade: 'V5', gradeProvisional: true },
      { id: 'v3', grade: 'V3', shownGrade: 'V3', gradeProvisional: false },
    ];
    expect(ids(sortAndFilterProblems(list, { sort: 'grade-asc' }))).toEqual(['v3', 'v5?', 'v7', 'none']);
  });
});

describe('matchesSearch', () => {
  const P = { id: 'x', name: 'Crimpy Traverse', setter: 'Rob', grade: 'V5' };

  it('matches everything for an empty or all-space query', () => {
    expect(matchesSearch(P, '')).toBe(true);
    expect(matchesSearch(P, '   ')).toBe(true);
  });

  it('matches part of the name or setter, ignoring case', () => {
    expect(matchesSearch(P, 'crimp')).toBe(true);
    expect(matchesSearch(P, 'ROB')).toBe(true);
    expect(matchesSearch(P, 'jug')).toBe(false);
  });

  it('needs every word to match, ignoring extra spaces', () => {
    expect(matchesSearch(P, '  crimp   rob ')).toBe(true);
    expect(matchesSearch(P, 'crimp sam')).toBe(false);
  });

  it('matches a grade only exactly, using the shown grade', () => {
    expect(matchesSearch(P, 'v5')).toBe(true);
    expect(matchesSearch({ ...P, grade: 'V10' }, 'v1')).toBe(false);
    expect(matchesSearch({ ...P, grade: null, shownGrade: 'V4', gradeProvisional: true }, 'v4')).toBe(true);
  });

  it('copes with missing setter and grade', () => {
    expect(matchesSearch({ id: 'y', name: 'Bare', setter: null, grade: null }, 'rob')).toBe(false);
    expect(matchesSearch({ id: 'y', name: 'Bare', setter: null, grade: null }, 'bare')).toBe(true);
  });

  it('treats regex characters as plain text', () => {
    expect(matchesSearch(P, 'v5(')).toBe(false);
    expect(matchesSearch(P, '.*')).toBe(false);
  });
});

describe('sortAndFilterProblems with a search', () => {
  it('filters by search before Unsent and sort', () => {
    const list = [
      { id: 'a', name: 'Crimp one', grade: 'V6', send_count: 0 },
      { id: 'b', name: 'Jug haul', grade: 'V2', send_count: 0 },
      { id: 'c', name: 'Crimp two', grade: 'V3', send_count: 1 },
      { id: 'd', name: 'Crimp three', grade: 'V4', send_count: 0 },
    ];
    expect(ids(sortAndFilterProblems(list, { search: 'crimp', unsentOnly: true, sort: 'grade-asc' }))).toEqual(['d', 'a']);
  });
});

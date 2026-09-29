export const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'grade-asc', label: 'Grade ↑' },
  { value: 'grade-desc', label: 'Grade ↓' },
];

// 'V10' -> 10; anything ungraded or unparseable -> null.
function gradeNumber(grade) {
  const match = /^V(\d+)$/.exec(grade || '');
  return match ? Number(match[1]) : null;
}

// Input is expected newest-first (as listProblems returns it); Array.prototype.sort
// is stable, so problems at the same grade stay newest-first.
export function sortAndFilterProblems(problems, { sort = 'newest', unsentOnly = false } = {}) {
  const list = unsentOnly ? problems.filter((p) => !p.send_count) : [...problems];
  if (sort === 'newest') return list;
  const direction = sort === 'grade-desc' ? -1 : 1;
  return list.sort((a, b) => {
    const ga = gradeNumber(a.grade);
    const gb = gradeNumber(b.grade);
    if (ga === null || gb === null) return (ga === null) - (gb === null);
    return (ga - gb) * direction;
  });
}

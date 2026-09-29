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

// Mirrors what the database does to a problem when a tick is inserted, so the
// list stays right without a refetch.
export function applySend(problems, problemId, sentOn) {
  return problems.map((p) => (p.id === problemId ? {
    ...p,
    send_count: (p.send_count || 0) + 1,
    last_sent_on: p.last_sent_on && p.last_sent_on > sentOn ? p.last_sent_on : sentOn,
  } : p));
}

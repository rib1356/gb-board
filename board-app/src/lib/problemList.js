export const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'grade-asc', label: 'Grade ↑' },
  { value: 'grade-desc', label: 'Grade ↓' },
];

// 'V10' -> 10; anything ungraded or unparseable -> null.
export function gradeNumber(grade) {
  const match = /^V(\d+)$/.exec(grade || '');
  return match ? Number(match[1]) : null;
}

// The grade a problem shows: its real grade, or the one its votes give it when
// it has none (see withShownGrades). Problems that never went through
// withShownGrades just have their real grade.
export function gradeOf(p) {
  return p.shownGrade ?? p.grade;
}

// The grade as printed next to a problem: "V5", "V5?" when it only comes from
// votes, or '' when there's none.
export function gradeLabel(p) {
  const grade = gradeOf(p);
  if (!grade) return '';
  return p.gradeProvisional ? `${grade}?` : grade;
}

// The board list's search. Every word in the query has to match: inside the
// name or the setter, or the whole shown grade -- exact, so "v1" doesn't pull
// in V10 to V17. Plain `includes`, so a typed bracket or dot is just text.
export function matchesSearch(problem, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const name = (problem.name || '').toLowerCase();
  const setter = (problem.setter || '').toLowerCase();
  const grade = (gradeOf(problem) || '').toLowerCase();
  return words.every((w) => name.includes(w) || setter.includes(w) || w === grade);
}

// Input is expected newest-first (as listProblems returns it); Array.prototype.sort
// is stable, so problems at the same grade stay newest-first.
// sentIds, when given, is one climber's sent problems -- unsentOnly then means
// unsent by them, not by anyone on the board.
export function sortAndFilterProblems(problems, { sort = 'newest', unsentOnly = false, sentIds = null, search = '' } = {}) {
  const isSent = sentIds ? (p) => sentIds.has(p.id) : (p) => p.send_count > 0;
  const found = search.trim() ? problems.filter((p) => matchesSearch(p, search)) : problems;
  const list = unsentOnly ? found.filter((p) => !isSent(p)) : [...found];
  if (sort === 'newest') return list;
  const direction = sort === 'grade-desc' ? -1 : 1;
  return list.sort((a, b) => {
    const ga = gradeNumber(gradeOf(a));
    const gb = gradeNumber(gradeOf(b));
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

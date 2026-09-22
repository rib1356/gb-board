// Whether a problem's holds still line up with the photo it's shown against.
// Holds are stored as x/y fractions of their photo, so they only mean anything
// against the exact frame they were placed on. Board photos are immutable once
// uploaded (each gets its own storage object), so comparing urls is an exact
// test of "same photo", not a guess.
export function photoStatus(problem, board) {
  if (!problem?.photo_url) return 'unknown';
  if (!board?.photo_url) return 'current';
  return problem.photo_url === board.photo_url ? 'current' : 'stale';
}

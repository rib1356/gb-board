export function pointFromClientCoords(rect, clientX, clientY) {
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

export function validateDraft({ name, holds }) {
  if (!name.trim()) return 'Give the problem a name first.';
  if (holds.length === 0) return 'Tap the board to mark at least one hold.';
  return null;
}

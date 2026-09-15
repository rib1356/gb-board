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

// Finds the topmost placed hold under a tapped point, so a tap can remove it
// instead of adding a new one nearby. A hold with a decoded mask is hit-tested
// against its actual mask pixels; one still showing as a circle (loading, or
// highlight mode unavailable) is hit-tested against an elliptical radius
// around its center instead.
export function holdAtPoint(holds, xFrac, yFrac, radiusXFrac, radiusYFrac) {
  for (let i = holds.length - 1; i >= 0; i--) {
    const h = holds[i];
    if (h._mask) {
      const { width, height, data } = h._mask;
      const px = Math.min(width - 1, Math.max(0, Math.round(xFrac * width)));
      const py = Math.min(height - 1, Math.max(0, Math.round(yFrac * height)));
      if (data[py * width + px]) return i;
    } else {
      const dx = (xFrac - h.x) / radiusXFrac;
      const dy = (yFrac - h.y) / radiusYFrac;
      if (dx * dx + dy * dy <= 1) return i;
    }
  }
  return -1;
}

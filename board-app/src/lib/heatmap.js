// Groups the hand holds marked on problems into "spots" and counts the
// problems using each, for the hold heatmap. The app only knows the holds
// that problems have marked, so a bare hold on the photo is an unused one.
// Feet are left out on purpose: a hold only ever stood on is still free to
// set on as a handhold.

export const MERGE_RADIUS = 0.02;

// Bands of use for the heatmap's colours. Most holds are used by one or two
// problems, so the low end gets a step each and everything from five up
// shares the hottest one; a smooth fade to the busiest hold ran the middle
// together.
export const HEAT_BANDS = [
  { min: 1, label: '1' },
  { min: 2, label: '2' },
  { min: 3, label: '3–4' },
  { min: 5, label: '5+' },
];

export function heatBand(heat) {
  return HEAT_BANDS.findLastIndex((b) => heat >= b.min);
}

const HAND_TYPES = new Set(['start', 'hold', 'finish']);

const oldestFirst = (a, b) => (
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
);

export function problemsOnPhoto(problems, photoUrl) {
  if (!photoUrl) return [];
  return problems.filter((p) => p.photo_url === photoUrl);
}

const newSpot = (face) => ({ sumX: 0, sumY: 0, marks: 0, ids: new Set(), face });

function addMark(spot, hold, problemId) {
  spot.sumX += hold.x;
  spot.sumY += hold.y;
  spot.marks += 1;
  spot.ids.add(problemId);
}

// The nearest plain-hold spot within the radius, or undefined.
function nearestSpot(spots, hold, aspect, radius) {
  let best;
  let bestDist = radius;
  for (const spot of spots) {
    if (spot.face) continue;
    const d = Math.hypot(spot.sumX / spot.marks - hold.x, (spot.sumY / spot.marks - hold.y) * aspect);
    if (d <= bestDist) {
      best = spot;
      bestDist = d;
    }
  }
  return best;
}

export function heatSpots(problems, photoUrl, aspect, radius = MERGE_RADIUS) {
  const spots = [];
  const sides = new Map();
  for (const problem of [...problemsOnPhoto(problems, photoUrl)].sort(oldestFirst)) {
    for (const hold of problem.holds) {
      if (!HAND_TYPES.has(hold.type)) continue;
      let spot;
      if (hold.face) {
        const key = `${hold.face.volumeId}|${hold.face.faceId}`;
        spot = sides.get(key);
        if (!spot) {
          spot = newSpot(true);
          sides.set(key, spot);
          spots.push(spot);
        }
      } else {
        spot = nearestSpot(spots, hold, aspect, radius);
        if (!spot) {
          spot = newSpot(false);
          spots.push(spot);
        }
      }
      addMark(spot, hold, problem.id);
    }
  }
  return spots.map((s) => ({ x: s.sumX / s.marks, y: s.sumY / s.marks, heat: s.ids.size, face: s.face }));
}

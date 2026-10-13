// Volumes are bolted on and have faces a problem can use. Highlight mode can't
// pick out a face (a tap on plain plywood segments the whole volume, or the
// bolt-on sitting on it), so each face is marked once by hand on the board
// photo: an outline of 3+ corners for a face you can see, or a single pin for
// one you can't (a lower volume's underside).

export const FACE_PRESETS = ['Top', 'Left', 'Right', 'Under'];

export const GRIPS = [
  { value: 'undercut', label: 'Undercut', short: 'UC' },
  { value: 'pinch', label: 'Pinch', short: 'Pinch' },
  { value: 'gaston', label: 'Gaston', short: 'Gaston' },
  { value: 'sidepull', label: 'Sidepull', short: 'Sidepull' },
];

const GRIPS_BY_VALUE = Object.fromEntries(GRIPS.map((g) => [g.value, g]));
const HAND_WORDS = { L: 'left hand', R: 'right hand' };

// randomUUID needs a secure context, so it's absent when the dev server is
// opened over a plain-http LAN address on a phone -- fall back there.
function newId(prefix) {
  const unique = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}-${unique}`;
}

export function isPinned(face) {
  return face.points.length === 1;
}

export function faceCenter(points) {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

// Points are fractions of the photo they were marked on, so a face only means
// anything against that exact photo -- same rule as a problem's holds.
export function facesOnPhoto(volumes, photoUrl) {
  return (volumes || [])
    .map((volume) => ({ volume, faces: volume.faces.filter((f) => f.photoUrl === photoUrl) }))
    .filter((row) => row.faces.length > 0);
}

// The label and points are copied into the problem, so re-marking or deleting
// the face later never changes a problem already set with it.
export function faceHold(volume, face, type) {
  return {
    ...faceCenter(face.points),
    type,
    face: { volumeId: volume.id, faceId: face.id, label: `${volume.name} ${face.name}`, points: face.points },
  };
}

export function tagLabel(hold) {
  return [hold.hand, GRIPS_BY_VALUE[hold.grip]?.short].filter(Boolean).join(' ');
}

// Normal holds aren't listed: "hold · right hand" couldn't say which hold.
export function faceListLines(holds) {
  return (holds || []).filter((h) => h.face).map((h) => {
    const parts = [h.type, HAND_WORDS[h.hand], GRIPS_BY_VALUE[h.grip]?.label.toLowerCase()].filter(Boolean);
    return `${h.face.label} — ${parts.join(' · ')}`;
  });
}

// The rows a volume shows in setup: the presets, then any custom faces already
// marked, then custom names typed in but not marked yet.
export function faceNames(volume, extraNames = []) {
  const names = [...FACE_PRESETS];
  for (const name of [...volume.faces.map((f) => f.name), ...extraNames]) {
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

export function faceStatus(face, photoUrl) {
  if (!face) return 'unmarked';
  if (face.photoUrl !== photoUrl) return 'old-photo';
  return isPinned(face) ? 'pinned' : 'outlined';
}

export function addVolume(volumes, name) {
  return [...volumes, { id: newId('v'), name: name.trim(), faces: [] }];
}

export function removeVolume(volumes, volumeId) {
  return volumes.filter((v) => v.id !== volumeId);
}

// Re-marking keeps the face's id, so problems' face buttons still recognise it.
export function setFace(volumes, volumeId, name, points, photoUrl) {
  return volumes.map((v) => {
    if (v.id !== volumeId) return v;
    const existing = v.faces.find((f) => f.name === name);
    const face = { id: existing?.id ?? newId('f'), name, points, photoUrl };
    return { ...v, faces: existing ? v.faces.map((f) => (f === existing ? face : f)) : [...v.faces, face] };
  });
}

export function clearFace(volumes, volumeId, name) {
  return volumes.map((v) => (v.id === volumeId ? { ...v, faces: v.faces.filter((f) => f.name !== name) } : v));
}

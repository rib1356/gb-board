// Volumes are bolted on and have sides (faces) a problem can use. Highlight
// mode can't pick out a side (a tap on plain plywood segments the whole
// volume, or the bolt-on sitting on it), so each side is marked once by hand
// on the board photo: an outline of 3+ corners for a side you can see, or a
// single pin for one you can't (a lower volume's underside). A volume lists
// all its sides, marked or not, so any of them can be renamed or removed.

export const DEFAULT_SIDES = ['Top', 'Left', 'Right'];

// randomUUID needs a secure context, so it's absent when the dev server is
// opened over a plain-http LAN address on a phone -- fall back there.
function newId(prefix) {
  const unique = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}-${unique}`;
}

function side(id, name) {
  return { id, name, points: [], photoUrl: null };
}

// Volumes saved before sides could be renamed only stored the sides that had
// been marked -- Top / Left / Right were implied. Spell those out as unmarked
// sides. Their ids come from the volume's, so they're the same on every render
// until the next save stores them.
export function upgradeVolumes(volumes) {
  return (volumes || []).map((v) => {
    if (v.sidesListed) return v;
    const defaults = DEFAULT_SIDES.map((name) => v.faces.find((f) => f.name === name) ?? side(`${v.id}-${name.toLowerCase()}`, name));
    const others = v.faces.filter((f) => !DEFAULT_SIDES.includes(f.name));
    return { ...v, sidesListed: true, faces: [...defaults, ...others] };
  });
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
    .map((volume) => ({ volume, faces: volume.faces.filter((f) => f.points.length > 0 && f.photoUrl === photoUrl) }))
    .filter((row) => row.faces.length > 0);
}

// The label and points are copied into the problem, so re-marking or removing
// the side later never changes where a problem already set with it is drawn.
export function faceHold(volume, face, type) {
  return {
    ...faceCenter(face.points),
    type,
    face: { volumeId: volume.id, faceId: face.id, label: `${volume.name} ${face.name}`, points: face.points },
  };
}

// A side's current name, so renaming it shows on problems already set with
// it; the problem's own copy of the label covers a side since removed.
export function faceLabel(hold, volumes) {
  const volume = (volumes || []).find((v) => v.id === hold.face.volumeId);
  const face = volume?.faces.find((f) => f.id === hold.face.faceId);
  return face ? `${volume.name} ${face.name}` : hold.face.label;
}

export function faceListLines(holds, volumes) {
  return (holds || []).filter((h) => h.face).map((h) => `${faceLabel(h, volumes)} — ${h.type}`);
}

// Compared ignoring case and spacing, so "top" can't sit beside "Top".
export function nameTaken(names, name) {
  const wanted = name.trim().toLowerCase();
  return names.some((n) => n.trim().toLowerCase() === wanted);
}

export function faceStatus(face, photoUrl) {
  if (face.points.length === 0) return 'unmarked';
  if (face.photoUrl !== photoUrl) return 'old-photo';
  return isPinned(face) ? 'pinned' : 'outlined';
}

export function addVolume(volumes, name) {
  return [...volumes, { id: newId('v'), name: name.trim(), sidesListed: true, faces: DEFAULT_SIDES.map((n) => side(newId('f'), n)) }];
}

function updateVolume(volumes, volumeId, change) {
  return volumes.map((v) => (v.id === volumeId ? change(v) : v));
}

function updateSide(volumes, volumeId, faceId, change) {
  return updateVolume(volumes, volumeId, (v) => ({ ...v, faces: v.faces.map((f) => (f.id === faceId ? change(f) : f)) }));
}

export function renameVolume(volumes, volumeId, name) {
  return updateVolume(volumes, volumeId, (v) => ({ ...v, name: name.trim() }));
}

export function removeVolume(volumes, volumeId) {
  return volumes.filter((v) => v.id !== volumeId);
}

export function addSide(volumes, volumeId, name) {
  return updateVolume(volumes, volumeId, (v) => ({ ...v, faces: [...v.faces, side(newId('f'), name.trim())] }));
}

// Keeps the side's id, so its face buttons and problems still recognise it.
export function renameSide(volumes, volumeId, faceId, name) {
  return updateSide(volumes, volumeId, faceId, (f) => ({ ...f, name: name.trim() }));
}

export function removeSide(volumes, volumeId, faceId) {
  return updateVolume(volumes, volumeId, (v) => ({ ...v, faces: v.faces.filter((f) => f.id !== faceId) }));
}

export function setFace(volumes, volumeId, faceId, points, photoUrl) {
  return updateSide(volumes, volumeId, faceId, (f) => ({ ...f, points, photoUrl }));
}

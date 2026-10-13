# Volume Faces & Hold Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark each volume's faces once on the board photo, add faces to problems from buttons, and tag any hold or face with hand and grip.

**Architecture:** Face shapes live on `boards.volumes` (jsonb, already added). A face added to a problem becomes one more entry in the existing `problems.holds` jsonb, carrying its own snapshot of label + points. Faces never go through segmentation: they're drawn as SVG over the photo from the hold data, alongside new tag labels. Pure logic sits in `src/lib/volumes.js`; UI pieces in `src/HoldOverlays.jsx`, `src/volumes/VolumesScreen.jsx`, `src/volumes/FaceButtons.jsx`, `src/volumes/HoldMenu.jsx`; `App.jsx` wires them in.

**Tech Stack:** React 19, Vite, Supabase JS, Vitest + Testing Library, lucide-react icons, inline styles.

**Spec:** `docs/superpowers/specs/2026-10-13-volume-faces-design.md`

## Global Constraints

- All commands run from `board-app/`. Tests: `npx vitest run <file>`. Lint: `npx oxlint`.
- No new dependencies.
- Inline styles in the existing palette: background `#17181A`, card `#232427`, card border `#2A2B2E`, control border `#3a3b3e`, muted text `#8b8d91`, body text `#EDEAE3` / `#c7c8cb`, link `#C08552`, accent `#D9552B`, green `#5C8A66`.
- Error banner copy: `Could not … — check your connection and try again.`
- Face presets exactly `['Top', 'Left', 'Right', 'Under']`. Grips exactly undercut / pinch / gaston / sidepull, labels `Undercut` / `Pinch` / `Gaston` / `Sidepull`, undercut shortens to `UC` on the photo.
- A hold's `hand` is `'L' | 'R'`; unset `hand` / `grip` / `face` are omitted from saved holds, never `undefined` or `null`.
- Comments explain *why*, in the style already in `App.jsx`.
- Commit after each task; end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push to `origin main` straight after each commit.

## Review Focus

1. Tagging a hold before its highlight mask finishes decoding — the highlight must still land (decode results match by `_key`, not object identity). Pinned in Task 5.
2. Editing an old problem set on a previous board photo — only faces marked on *that* photo are offered. Pinned in Task 5.
3. A problem made only of faces — saves without a highlight image and still draws. Pinned in Task 5.
4. A board row with no `volumes` value — setup and editor treat it as no volumes, no crash. Pinned in Tasks 1 and 4.
5. A problem whose face was later deleted from the board — still draws and lists from its snapshot. Pinned in Task 3.

---

### Task 1: Volumes logic module

**Files:**
- Create: `board-app/src/lib/volumes.js`
- Test: `board-app/src/lib/volumes.test.js`

**Interfaces:**
- Produces:
  - `FACE_PRESETS: string[]`
  - `GRIPS: { value, label, short }[]`
  - `isPinned(face: { points }) => boolean`
  - `faceCenter(points: {x,y}[]) => {x,y}`
  - `facesOnPhoto(volumes | null | undefined, photoUrl) => { volume, faces }[]`
  - `faceHold(volume, face, type) => { x, y, type, face: { volumeId, faceId, label, points } }`
  - `tagLabel(hold) => string`
  - `faceListLines(holds) => string[]`
  - `faceNames(volume, extraNames?) => string[]`
  - `faceStatus(face | undefined, photoUrl) => 'unmarked' | 'old-photo' | 'pinned' | 'outlined'`
  - `addVolume(volumes, name)`, `removeVolume(volumes, volumeId)`, `setFace(volumes, volumeId, name, points, photoUrl)`, `clearFace(volumes, volumeId, name)` — each returns a new array

- [ ] **Step 1: Write the failing tests**

```js
// board-app/src/lib/volumes.test.js
import { describe, it, expect } from 'vitest';
import {
  FACE_PRESETS, GRIPS, isPinned, faceCenter, facesOnPhoto, faceHold, tagLabel, faceListLines,
  faceNames, faceStatus, addVolume, removeVolume, setFace, clearFace,
} from './volumes';

const PHOTO = 'https://cdn.example/b1.jpg';
const OLD = 'https://cdn.example/old.jpg';
const TRI = [{ x: 0.25, y: 0.125 }, { x: 0.75, y: 0.125 }, { x: 0.5, y: 0.5 }];

describe('presets', () => {
  it('offers the four standard faces and four grips', () => {
    expect(FACE_PRESETS).toEqual(['Top', 'Left', 'Right', 'Under']);
    expect(GRIPS.map((g) => g.value)).toEqual(['undercut', 'pinch', 'gaston', 'sidepull']);
  });
});

describe('isPinned', () => {
  it('treats a single point as a pin and 3+ as an outline', () => {
    expect(isPinned({ points: [{ x: 0.5, y: 0.5 }] })).toBe(true);
    expect(isPinned({ points: TRI })).toBe(false);
  });
});

describe('faceCenter', () => {
  it('averages the points', () => {
    expect(faceCenter(TRI)).toEqual({ x: 0.5, y: 0.25 });
  });

  it('is the pin itself for a single point', () => {
    expect(faceCenter([{ x: 0.3, y: 0.7 }])).toEqual({ x: 0.3, y: 0.7 });
  });
});

describe('facesOnPhoto', () => {
  const volumes = [
    { id: 'v1', name: 'Vol1', faces: [
      { id: 'f1', name: 'Top', points: TRI, photoUrl: PHOTO },
      { id: 'f2', name: 'Left', points: TRI, photoUrl: OLD },
    ] },
    { id: 'v2', name: 'Vol2', faces: [{ id: 'f3', name: 'Top', points: TRI, photoUrl: OLD }] },
  ];

  it('keeps only faces marked on that photo and drops volumes left with none', () => {
    expect(facesOnPhoto(volumes, PHOTO)).toEqual([{ volume: volumes[0], faces: [volumes[0].faces[0]] }]);
  });

  it('treats a missing volumes value as no volumes', () => {
    expect(facesOnPhoto(null, PHOTO)).toEqual([]);
    expect(facesOnPhoto(undefined, PHOTO)).toEqual([]);
  });
});

describe('faceHold', () => {
  it('snapshots the label and points, centred on the face', () => {
    const volume = { id: 'v1', name: 'Vol1', faces: [] };
    const face = { id: 'f1', name: 'Top', points: TRI, photoUrl: PHOTO };
    expect(faceHold(volume, face, 'start')).toEqual({
      x: 0.5, y: 0.25, type: 'start',
      face: { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: TRI },
    });
  });
});

describe('tagLabel', () => {
  it('joins hand then the short grip', () => {
    expect(tagLabel({ hand: 'R', grip: 'undercut' })).toBe('R UC');
    expect(tagLabel({ hand: 'L', grip: 'pinch' })).toBe('L Pinch');
  });

  it('shows whichever half is set', () => {
    expect(tagLabel({ hand: 'L' })).toBe('L');
    expect(tagLabel({ grip: 'gaston' })).toBe('Gaston');
  });

  it('is empty for an untagged hold', () => {
    expect(tagLabel({ x: 0.1, y: 0.1, type: 'hold' })).toBe('');
  });
});

describe('faceListLines', () => {
  it('lists faces only, in placement order, with hand and grip spelled out', () => {
    const face = (label) => ({ volumeId: 'v', faceId: label, label, points: TRI });
    const holds = [
      { x: 0.5, y: 0.25, type: 'start', face: face('Vol1 Top') },
      { x: 0.1, y: 0.1, type: 'hold', hand: 'L', grip: 'pinch' },
      { x: 0.5, y: 0.25, type: 'hold', hand: 'L', face: face('Vol2 Right') },
      { x: 0.5, y: 0.25, type: 'hold', hand: 'R', grip: 'undercut', face: face('Vol2 Top') },
    ];
    expect(faceListLines(holds)).toEqual([
      'Vol1 Top — start',
      'Vol2 Right — hold · left hand',
      'Vol2 Top — hold · right hand · undercut',
    ]);
  });

  it('is empty for a problem without faces', () => {
    expect(faceListLines([{ x: 0.1, y: 0.1, type: 'hold' }])).toEqual([]);
  });
});

describe('faceNames', () => {
  it('lists presets, then stored custom faces, then unsaved custom names, without repeats', () => {
    const volume = { id: 'v1', name: 'Vol1', faces: [
      { id: 'f1', name: 'Top', points: TRI, photoUrl: PHOTO },
      { id: 'f2', name: 'Front', points: TRI, photoUrl: PHOTO },
    ] };
    expect(faceNames(volume, ['Back', 'Front'])).toEqual(['Top', 'Left', 'Right', 'Under', 'Front', 'Back']);
  });
});

describe('faceStatus', () => {
  it('reports unmarked, old photo, pinned and outlined', () => {
    expect(faceStatus(undefined, PHOTO)).toBe('unmarked');
    expect(faceStatus({ points: TRI, photoUrl: OLD }, PHOTO)).toBe('old-photo');
    expect(faceStatus({ points: [{ x: 0.5, y: 0.5 }], photoUrl: PHOTO }, PHOTO)).toBe('pinned');
    expect(faceStatus({ points: TRI, photoUrl: PHOTO }, PHOTO)).toBe('outlined');
  });
});

describe('volume updaters', () => {
  const start = [{ id: 'v1', name: 'Vol1', faces: [{ id: 'f1', name: 'Top', points: TRI, photoUrl: OLD }] }];
  const snapshot = JSON.stringify(start);

  it('addVolume appends a trimmed, empty volume with a new id', () => {
    const next = addVolume(start, '  Vol2 ');
    expect(next[1]).toEqual({ id: expect.stringMatching(/^v-/), name: 'Vol2', faces: [] });
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('removeVolume drops it', () => {
    expect(removeVolume(start, 'v1')).toEqual([]);
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('setFace re-marks an existing face in place, keeping its id', () => {
    const pin = [{ x: 0.4, y: 0.6 }];
    const next = setFace(start, 'v1', 'Top', pin, PHOTO);
    expect(next[0].faces).toEqual([{ id: 'f1', name: 'Top', points: pin, photoUrl: PHOTO }]);
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('setFace adds a face that was never marked', () => {
    const next = setFace(start, 'v1', 'Under', [{ x: 0.4, y: 0.6 }], PHOTO);
    expect(next[0].faces[1]).toEqual({ id: expect.stringMatching(/^f-/), name: 'Under', points: [{ x: 0.4, y: 0.6 }], photoUrl: PHOTO });
  });

  it('clearFace removes it', () => {
    expect(clearFace(start, 'v1', 'Top')[0].faces).toEqual([]);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/volumes.test.js`
Expected: FAIL — cannot resolve `./volumes`.

- [ ] **Step 3: Write the implementation**

```js
// board-app/src/lib/volumes.js

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/volumes.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/volumes.js src/lib/volumes.test.js
git commit -m "feat: add volume face and hold tag logic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: Hold saving, face-aware hit testing, and saveVolumes

**Files:**
- Modify: `board-app/src/lib/holds.js` (`holdAtPoint`, new `cleanHold`)
- Modify: `board-app/src/lib/board.js` (new `saveVolumes` after `saveWarmup`)
- Test: `board-app/src/lib/holds.test.js`, `board-app/src/lib/board.test.js`

**Interfaces:**
- Produces:
  - `cleanHold(hold) => { x, y, type, hand?, grip?, face? }` — drops `_`-prefixed fields and unset tags
  - `holdAtPoint(...)` now never returns the index of a hold with `face`
  - `saveVolumes(boardId, volumes) => Promise<board>`

- [ ] **Step 1: Write the failing tests**

Add to `board-app/src/lib/holds.test.js` — change the import to
`import { pointFromClientCoords, validateDraft, holdAtPoint, cleanHold } from './holds';` and append inside `describe('holdAtPoint', …)`:

```js
  it('skips volume faces, so a bolt-on sitting on a face can still be tapped', () => {
    const face = { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.5, y: 0.6 }] };
    const holds = [{ x: 0.5, y: 0.5, type: 'start', face }];
    expect(holdAtPoint(holds, 0.5, 0.5, 0.05, 0.05)).toBe(-1);
  });
```

and a new block at the end of the file:

```js
describe('cleanHold', () => {
  it('keeps position and type, and drops draft-only fields', () => {
    const mask = { width: 1, height: 1, data: new Uint8Array(1) };
    expect(cleanHold({ x: 0.1, y: 0.2, type: 'hold', _mask: mask, _maskUrl: 'data:', _key: 3 }))
      .toEqual({ x: 0.1, y: 0.2, type: 'hold' });
  });

  it('keeps hand, grip and face when set', () => {
    const face = { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: [{ x: 0.5, y: 0.5 }] };
    expect(cleanHold({ x: 0.5, y: 0.5, type: 'start', hand: 'L', grip: 'pinch', face, _key: 1 }))
      .toEqual({ x: 0.5, y: 0.5, type: 'start', hand: 'L', grip: 'pinch', face });
  });

  it('leaves out tags that were cleared', () => {
    const cleaned = cleanHold({ x: 0.5, y: 0.5, type: 'hold', hand: undefined, grip: undefined });
    expect(cleaned).toEqual({ x: 0.5, y: 0.5, type: 'hold' });
    expect(Object.keys(cleaned)).toEqual(['x', 'y', 'type']);
  });
});
```

In `board-app/src/lib/board.test.js`, add `saveVolumes,` to the import list after `saveWarmup,` and add after the `saveWarmup` describe:

```js
describe('saveVolumes', () => {
  it('writes every volume to the board and returns the updated board', async () => {
    const volumes = [{ id: 'v1', name: 'Vol1', faces: [] }];
    const updated = { id: 'b1', volumes };
    const c = chain({ data: updated, error: null });
    mocks.supabase.from.mockReturnValue(c);
    expect(await saveVolumes('b1', volumes)).toEqual(updated);
    expect(mocks.supabase.from).toHaveBeenCalledWith('boards');
    expect(c.update).toHaveBeenCalledWith({ volumes });
    expect(c.eq).toHaveBeenCalledWith('id', 'b1');
  });

  it('throws when the update fails', async () => {
    mocks.supabase.from.mockReturnValue(chain({ data: null, error: new Error('nope') }));
    await expect(saveVolumes('b1', [])).rejects.toThrow('nope');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/holds.test.js src/lib/board.test.js`
Expected: FAIL — `cleanHold` / `saveVolumes` not exported; the face hit-test returns 0.

- [ ] **Step 3: Implement**

In `board-app/src/lib/holds.js`, inside `holdAtPoint`'s loop, right after `const h = holds[i];`:

```js
    // Faces are added and edited from their own buttons; the photo is for
    // holds, so a bolt-on sitting on a lit face stays tappable.
    if (h.face) continue;
```

and append:

```js
// What gets saved for a draft hold -- drops the draft-only `_` fields (masks,
// the hold menu's key) and any tag that isn't set.
export function cleanHold({ x, y, type, hand, grip, face }) {
  return { x, y, type, ...(hand && { hand }), ...(grip && { grip }), ...(face && { face }) };
}
```

In `board-app/src/lib/board.js`, after `saveWarmup`:

```js
export async function saveVolumes(boardId, volumes) {
  const { data, error } = await supabase
    .from('boards')
    .update({ volumes })
    .eq('id', boardId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/holds.test.js src/lib/board.test.js`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/holds.js src/lib/holds.test.js src/lib/board.js src/lib/board.test.js
git commit -m "feat: save hold tags and faces, and save a board's volumes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: Draw faces and tags on a problem, and list its faces

**Files:**
- Create: `board-app/src/HoldOverlays.jsx` (`ChalkRing` moves here from `App.jsx`, plus `FaceShape`, `TagPill`, `HoldLabels`)
- Modify: `board-app/src/App.jsx` (remove `ChalkRing`, import overlays, photo panel, detail `Volumes` section)
- Test: `board-app/src/App.test.jsx`

**Interfaces:**
- Consumes: `isPinned`, `tagLabel`, `faceListLines` (Task 1)
- Produces (from `src/HoldOverlays.jsx`):
  - `ChalkRing({ x, y, color, label?, size? })` — unchanged, `data-testid="hold-marker"`
  - `FaceShape({ points, color, fillOpacity? = 0.65 })` — `data-testid="face-shape"`
  - `TagPill({ x, y, text, color })` — `data-testid="tag-pill"`
  - `HoldLabels({ hold, color })` — pinned face ring + `label · tag` pill, or a tag pill for any other tagged hold

- [ ] **Step 1: Write the failing test**

Append to `board-app/src/App.test.jsx`:

```js
describe('App (volume faces on a problem)', () => {
  it("draws a problem's faces, pins and tags from its own copy, and lists its faces", async () => {
    // The board has no volumes at all -- the problem's snapshot is enough.
    listProblems.mockResolvedValue([{
      id: 'p1', name: 'Volume Line', grade: 'V3', setter: 'Rob', notes: '',
      holds: [
        { x: 0.5, y: 0.25, type: 'start', face: { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: [{ x: 0.25, y: 0.125 }, { x: 0.75, y: 0.125 }, { x: 0.5, y: 0.5 }] } },
        { x: 0.6, y: 0.7, type: 'hold', hand: 'R', grip: 'undercut', face: { volumeId: 'v2', faceId: 'f2', label: 'Vol2 Under', points: [{ x: 0.6, y: 0.7 }] } },
        { x: 0.2, y: 0.8, type: 'hold', hand: 'L', grip: 'pinch' },
      ],
    }]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Volume Line'));

    expect(await screen.findAllByTestId('face-shape')).toHaveLength(1);
    // One ring for the plain hold, one for the pinned face -- the outlined face gets none.
    expect(screen.getAllByTestId('hold-marker')).toHaveLength(2);
    expect(screen.getByText('Vol2 Under · R UC')).toBeInTheDocument();
    expect(screen.getByText('L Pinch')).toBeInTheDocument();
    expect(screen.getByText('Vol1 Top — start')).toBeInTheDocument();
    expect(screen.getByText('Vol2 Under — hold · right hand · undercut')).toBeInTheDocument();
  });

  it('shows no Volumes section for a problem without faces', async () => {
    listProblems.mockResolvedValue([{
      id: 'p1', name: 'Plain Line', grade: 'V3', setter: 'Rob', notes: '', holds: [{ x: 0.2, y: 0.8, type: 'hold' }],
    }]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Plain Line'));

    expect(await screen.findByText('Not sent yet')).toBeInTheDocument();
    expect(screen.queryByText('Volumes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tag-pill')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/App.test.jsx -t "volume faces on a problem"`
Expected: FAIL — no `face-shape`, three `hold-marker`s, no list text.

- [ ] **Step 3: Create `board-app/src/HoldOverlays.jsx`**

```jsx
import { isPinned, tagLabel } from './lib/volumes';

export function ChalkRing({ x, y, color, label, size = 34 }) {
  return (
    <div
      data-testid="hold-marker"
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        width: size,
        height: size,
        pointerEvents: 'none',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 40 40">
        <circle
          cx="20" cy="20" r="15"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray="4 3"
          strokeLinecap="round"
          transform="rotate(-12 20 20)"
        />
      </svg>
      {label ? (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color,
        }}>{label}</div>
      ) : null}
    </div>
  );
}

// The same darker-shade border segment.js gives a segmented hold
// (BORDER_BRIGHTNESS), so a face reads as the same kind of mark.
function shade(hex, factor = 0.45) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift) => Math.round(((n >> shift) & 255) * factor);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

// Drawn from the face's corner points rather than baked into the saved
// highlight image, so it needs no segmentation and stays crisp at any size.
export function FaceShape({ points, color, fillOpacity = 0.65 }) {
  return (
    <svg
      data-testid="face-shape"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <polygon
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={shade(color)}
        strokeOpacity={0.9}
        strokeWidth={3}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function TagPill({ x, y, text, color }) {
  return (
    <div
      data-testid="tag-pill"
      style={{
        position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`,
        // Holds near the right edge get their label on the left, so it stays on the photo.
        transform: x > 0.75 ? 'translate(calc(-100% - 10px), 8px)' : 'translate(10px, 8px)',
        background: '#17181Ae6', color: '#EDEAE3', border: `1px solid ${color}`, borderRadius: 999,
        padding: '1px 7px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none',
      }}
    >{text}</div>
  );
}

// Drawn on top of whatever shows the hold itself (saved highlight, live mask
// or chalk ring). A pinned face has nothing else showing it, so it gets its
// own ring and always carries its name.
export function HoldLabels({ hold, color }) {
  const tag = tagLabel(hold);
  if (hold.face && isPinned(hold.face)) {
    return (
      <>
        <ChalkRing x={hold.x} y={hold.y} color={color} />
        <TagPill x={hold.x} y={hold.y} color={color} text={tag ? `${hold.face.label} · ${tag}` : hold.face.label} />
      </>
    );
  }
  return tag ? <TagPill x={hold.x} y={hold.y} color={color} text={tag} /> : null;
}
```

- [ ] **Step 4: Wire into `board-app/src/App.jsx`**

1. Delete the `ChalkRing` function (lines 34–67) and add imports:

```jsx
import { ChalkRing, FaceShape, HoldLabels } from './HoldOverlays';
import { isPinned, faceListLines } from './lib/volumes';
```

and change `import { inputStyle } from './ui';` to `import { inputStyle, sectionHeading } from './ui';`.

2. In the photo panel, replace the block

```jsx
          {lockedMaskUrl ? (
            <HoldHighlight src={lockedMaskUrl} />
          ) : (
            displayHolds.map((h, i) => (
              h._maskUrl ? (
                <HoldHighlight key={i} src={h._maskUrl} />
              ) : (
                <ChalkRing key={i} x={h.x} y={h.y} color={HOLD_COLORS[h.type]} label={h.type === 'hold' ? String(i + 1) : ''} />
              )
            ))
          )}
```

with

```jsx
          {/* Faces go underneath, so a bolt-on highlighted on top of a face stays visible. */}
          {displayHolds.map((h, i) => (
            h.face && !isPinned(h.face) ? <FaceShape key={`face-${i}`} points={h.face.points} color={HOLD_COLORS[h.type]} /> : null
          ))}
          {lockedMaskUrl ? (
            <HoldHighlight src={lockedMaskUrl} />
          ) : (
            displayHolds.map((h, i) => (
              h.face ? null : h._maskUrl ? (
                <HoldHighlight key={i} src={h._maskUrl} />
              ) : (
                <ChalkRing key={i} x={h.x} y={h.y} color={HOLD_COLORS[h.type]} label={h.type === 'hold' ? String(i + 1) : ''} />
              )
            ))
          )}
          {displayHolds.map((h, i) => <HoldLabels key={`label-${i}`} hold={h} color={HOLD_COLORS[h.type]} />)}
```

3. In the detail view, directly after the rating / sent row's closing `</div>` and before `{selected.notes && …}`:

```jsx
            {faceListLines(selected.holds).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h3 style={sectionHeading}>Volumes</h3>
                {faceListLines(selected.holds).map((line) => (
                  <div key={line} style={{ fontSize: 14, color: '#c7c8cb', lineHeight: 1.6 }}>{line}</div>
                ))}
              </div>
            )}
```

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: PASS, including the two new tests.

- [ ] **Step 6: Commit and push**

```bash
git add src/HoldOverlays.jsx src/App.jsx src/App.test.jsx
git commit -m "feat: draw volume faces and hand/grip tags on a problem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4: Volumes setup screen

**Files:**
- Create: `board-app/src/volumes/VolumesScreen.jsx`
- Modify: `board-app/src/HoldOverlays.jsx` (add `VolumeMarks`, `MarkingDots`)
- Modify: `board-app/src/App.jsx` (view `'volumes'`, entry button, marking state, photo-tap routing)
- Test: `board-app/src/App.test.jsx`

**Interfaces:**
- Consumes: `facesOnPhoto`, `faceCenter`, `isPinned`, `faceNames`, `faceStatus`, `addVolume`, `removeVolume`, `setFace`, `clearFace` (Task 1); `saveVolumes` (Task 2); `ChalkRing`, `FaceShape`, `TagPill` (Task 3)
- Produces:
  - App state `marking: null | { volumeId, name, mode: 'outline' | 'pin', points: {x,y}[] }`
  - `VolumesScreen({ volumes, photoUrl, marking, saving, onSave(next) => Promise<boolean>, onStartMarking({ volumeId, name, mode }), onUndoPoint(), onFinishOutline(), onCancelMarking() })`
  - `VolumeMarks({ volumes, photoUrl, marking })`
  - App `volumes` constant (`board?.volumes || []`), used again in Task 5

- [ ] **Step 1: Write the failing tests**

In `board-app/src/App.test.jsx`, add `saveVolumes: vi.fn(),` to the `vi.mock('./lib/board', …)` factory and `saveVolumes` to the `import { … } from './lib/board'` line. Then append:

```js
describe('App (volumes setup)', () => {
  const PHOTO = 'https://cdn.example/b1.jpg';
  const boardWith = (volumes) => ({ id: 'b1', name: 'Home Board', photo_url: PHOTO, volumes });

  beforeEach(() => {
    saveVolumes.mockImplementation(async (id, volumes) => boardWith(volumes));
  });

  async function openVolumes(user) {
    await user.click(await screen.findByRole('button', { name: 'Volumes' }));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100,
    });
    return photo.parentElement;
  }

  it('has no Volumes button until the board has a photo', async () => {
    render(<App />);
    await screen.findByText('THE BOARD');
    expect(screen.queryByRole('button', { name: 'Volumes' })).not.toBeInTheDocument();
  });

  it('adds a volume to a board that has never had any', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: PHOTO });
    render(<App />);
    const user = userEvent.setup();
    await openVolumes(user);

    expect(screen.getByText(/No volumes yet/)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('e.g. Vol1'), 'Vol1');
    await user.click(screen.getByRole('button', { name: 'Add volume' }));

    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', [
      { id: expect.stringMatching(/^v-/), name: 'Vol1', faces: [] },
    ]));
    expect(await screen.findByText('Vol1')).toBeInTheDocument();
    expect(screen.getAllByText('Not marked')).toHaveLength(4);
  });

  it('outlines a face by tapping its corners, with undo', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([{ id: 'v1', name: 'Vol1', faces: [] }]));
    render(<App />);
    const user = userEvent.setup();
    const panel = await openVolumes(user);

    await user.click(screen.getByRole('button', { name: 'Outline Vol1 Top' }));
    expect(screen.getByText('Tap the corners of Vol1 Top')).toBeInTheDocument();
    fireEvent.click(panel, { clientX: 20, clientY: 10 });
    fireEvent.click(panel, { clientX: 60, clientY: 10 });
    fireEvent.click(panel, { clientX: 190, clientY: 90 });
    await user.click(screen.getByRole('button', { name: 'Undo point' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    fireEvent.click(panel, { clientX: 40, clientY: 40 });
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', [{ id: 'v1', name: 'Vol1', faces: [
      { id: expect.stringMatching(/^f-/), name: 'Top', points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.4 }], photoUrl: PHOTO },
    ] }]));
    expect(await screen.findByText('Outlined')).toBeInTheDocument();
    expect(screen.getByTestId('face-shape')).toBeInTheDocument();
  });

  it('pins a face you cannot see with a single tap', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([{ id: 'v2', name: 'Vol2', faces: [] }]));
    render(<App />);
    const user = userEvent.setup();
    const panel = await openVolumes(user);

    await user.click(screen.getByRole('button', { name: 'Pin Vol2 Under' }));
    expect(screen.getByText('Tap where Vol2 Under is')).toBeInTheDocument();
    fireEvent.click(panel, { clientX: 100, clientY: 80 });

    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', [{ id: 'v2', name: 'Vol2', faces: [
      { id: expect.stringMatching(/^f-/), name: 'Under', points: [{ x: 0.5, y: 0.8 }], photoUrl: PHOTO },
    ] }]));
    expect(await screen.findByText('Pinned')).toBeInTheDocument();
  });

  it('keeps the outline open to retry when saving fails', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([{ id: 'v1', name: 'Vol1', faces: [] }]));
    saveVolumes.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    const user = userEvent.setup();
    const panel = await openVolumes(user);

    await user.click(screen.getByRole('button', { name: 'Outline Vol1 Top' }));
    fireEvent.click(panel, { clientX: 20, clientY: 10 });
    fireEvent.click(panel, { clientX: 60, clientY: 10 });
    fireEvent.click(panel, { clientX: 40, clientY: 40 });
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByText('Could not save the volumes — check your connection and try again.')).toBeInTheDocument();
    expect(screen.getByText('Tap the corners of Vol1 Top')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Outlined')).toBeInTheDocument();
  });

  it('flags a face marked on an older photo, and clears a face', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([{ id: 'v1', name: 'Vol1', faces: [
      { id: 'f1', name: 'Top', points: [{ x: 0.5, y: 0.5 }], photoUrl: 'https://cdn.example/old.jpg' },
      { id: 'f2', name: 'Left', points: [{ x: 0.5, y: 0.5 }], photoUrl: PHOTO },
    ] }]));
    render(<App />);
    const user = userEvent.setup();
    await openVolumes(user);

    expect(screen.getByText('Old photo — re-mark')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear Vol1 Left' }));
    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', [{ id: 'v1', name: 'Vol1', faces: [
      { id: 'f1', name: 'Top', points: [{ x: 0.5, y: 0.5 }], photoUrl: 'https://cdn.example/old.jpg' },
    ] }]));
  });

  it('adds a custom face name that can then be marked', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([{ id: 'v1', name: 'Vol1', faces: [] }]));
    render(<App />);
    const user = userEvent.setup();
    await openVolumes(user);

    await user.click(screen.getByRole('button', { name: '+ Custom face' }));
    await user.type(screen.getByPlaceholderText('Face name'), 'Front');
    await user.click(screen.getByRole('button', { name: 'Add face' }));

    expect(screen.getByRole('button', { name: 'Pin Vol1 Front' })).toBeInTheDocument();
    expect(saveVolumes).not.toHaveBeenCalled();
  });

  it('deletes a volume after confirming', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([{ id: 'v1', name: 'Vol1', faces: [] }]));
    render(<App />);
    const user = userEvent.setup();
    await openVolumes(user);

    await user.click(screen.getByRole('button', { name: 'Delete Vol1' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', []));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/App.test.jsx -t "volumes setup"`
Expected: FAIL — no `Volumes` button.

- [ ] **Step 3: Add `VolumeMarks` and `MarkingDots` to `board-app/src/HoldOverlays.jsx`**

Change the first import to:

```jsx
import { Fragment } from 'react';
import { isPinned, tagLabel, facesOnPhoto, faceCenter } from './lib/volumes';
```

and append:

```jsx
export function MarkingDots({ points }) {
  return points.map((p, i) => (
    <div key={i} style={{
      position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: 'translate(-50%, -50%)',
      width: 9, height: 9, borderRadius: '50%', background: '#D9552B', border: '2px solid #17181A',
      pointerEvents: 'none',
    }} />
  ));
}

const MARK_COLOR = '#C08552';

// Setup view: every face marked on this photo in one neutral colour, plus the
// outline being drawn right now.
export function VolumeMarks({ volumes, photoUrl, marking }) {
  return (
    <>
      {facesOnPhoto(volumes, photoUrl).flatMap(({ volume, faces }) => faces.map((face) => {
        // The face being re-marked is shown by its new outline instead.
        if (marking && marking.volumeId === volume.id && marking.name === face.name) return null;
        const center = faceCenter(face.points);
        return (
          <Fragment key={face.id}>
            {isPinned(face)
              ? <ChalkRing x={center.x} y={center.y} color={MARK_COLOR} />
              : <FaceShape points={face.points} color={MARK_COLOR} fillOpacity={0.35} />}
            <TagPill x={center.x} y={center.y} color={MARK_COLOR} text={`${volume.name} ${face.name}`} />
          </Fragment>
        );
      }))}
      {marking && marking.points.length >= 3 && <FaceShape points={marking.points} color="#D9552B" fillOpacity={0.35} />}
      {marking && <MarkingDots points={marking.points} />}
    </>
  );
}
```

- [ ] **Step 4: Create `board-app/src/volumes/VolumesScreen.jsx`**

```jsx
import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { faceNames, faceStatus, addVolume, removeVolume, clearFace } from '../lib/volumes';
import { inputStyle, sectionHeading, linkButton, primaryButton } from '../ui';

const STATUS_TEXT = {
  outlined: 'Outlined',
  pinned: 'Pinned',
  unmarked: 'Not marked',
  'old-photo': 'Old photo — re-mark',
};

const smallButton = {
  background: 'none', border: '1px solid #3a3b3e', color: '#c7c8cb', borderRadius: 8,
  padding: '5px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

const card = { background: '#232427', border: '1px solid #2A2B2E', borderRadius: 12, padding: 12, marginBottom: 10 };

export default function VolumesScreen({ volumes, photoUrl, marking, saving, onSave, onStartMarking, onUndoPoint, onFinishOutline, onCancelMarking }) {
  const [newVolumeName, setNewVolumeName] = useState('');
  // Custom face names typed in but not marked yet -- a face is only stored
  // once it has an outline or a pin.
  const [customNames, setCustomNames] = useState({});
  const [customFor, setCustomFor] = useState(null);
  const [customName, setCustomName] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  if (marking) {
    const volumeName = volumes.find((v) => v.id === marking.volumeId)?.name ?? '';
    const label = `${volumeName} ${marking.name}`;
    const count = marking.points.length;
    return (
      <div style={{ ...card, marginTop: 16, padding: 14 }}>
        <p style={{ margin: '0 0 4px', fontSize: 14.5, fontWeight: 600 }}>
          {marking.mode === 'pin' ? `Tap where ${label} is` : `Tap the corners of ${label}`}
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#8b8d91' }}>
          {marking.mode === 'pin'
            ? 'For a face the photo can’t show — tap the hold coming off it, or its nearest edge.'
            : `${count} corner${count === 1 ? '' : 's'} — at least 3`}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {marking.mode === 'outline' && (
            <>
              <button onClick={onUndoPoint} disabled={count === 0 || saving} style={smallButton}>Undo point</button>
              <button onClick={onFinishOutline} disabled={count < 3 || saving} style={primaryButton(count >= 3 && !saving)}>Done</button>
            </>
          )}
          <button onClick={onCancelMarking} disabled={saving} style={smallButton}>Cancel</button>
        </div>
      </div>
    );
  }

  const handleAddVolume = async () => {
    if (await onSave(addVolume(volumes, newVolumeName))) setNewVolumeName('');
  };

  const handleAddCustom = (volumeId) => {
    setCustomNames((prev) => ({ ...prev, [volumeId]: [...(prev[volumeId] || []), customName.trim()] }));
    setCustomFor(null);
    setCustomName('');
  };

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={sectionHeading}>Volumes</h2>
      <p style={{ fontSize: 13, color: '#8b8d91', margin: '0 0 14px' }}>
        Outline a face you can see by tapping its corners. Pin one the photo can’t show with a single tap.
      </p>

      {volumes.length === 0 && (
        <p style={{ fontSize: 14, color: '#6d6f73', margin: '0 0 14px' }}>No volumes yet. Add one for each volume on the board.</p>
      )}

      {volumes.map((volume) => {
        const names = faceNames(volume, customNames[volume.id]);
        const customTaken = names.some((n) => n.toLowerCase() === customName.trim().toLowerCase());
        return (
          <div key={volume.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{volume.name}</span>
              {confirmingDeleteId === volume.id ? (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => onSave(removeVolume(volumes, volume.id))} disabled={saving} style={{ ...smallButton, background: '#D9552B', borderColor: '#D9552B', color: '#17181A' }}>Yes, delete</button>
                  <button onClick={() => setConfirmingDeleteId(null)} style={smallButton}>Cancel</button>
                </span>
              ) : (
                <button aria-label={`Delete ${volume.name}`} onClick={() => setConfirmingDeleteId(volume.id)} style={{ ...linkButton, color: '#8b8d91' }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {names.map((name) => {
              const face = volume.faces.find((f) => f.name === name);
              const status = faceStatus(face, photoUrl);
              const label = `${volume.name} ${name}`;
              return (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #2A2B2E' }}>
                  <span style={{ width: 56, fontSize: 14, fontWeight: 600 }}>{name}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: status === 'old-photo' ? '#D9552B' : '#8b8d91' }}>{STATUS_TEXT[status]}</span>
                  <button aria-label={`Outline ${label}`} onClick={() => onStartMarking({ volumeId: volume.id, name, mode: 'outline' })} style={smallButton}>Outline</button>
                  <button aria-label={`Pin ${label}`} onClick={() => onStartMarking({ volumeId: volume.id, name, mode: 'pin' })} style={smallButton}>Pin</button>
                  {face && (
                    <button aria-label={`Clear ${label}`} onClick={() => onSave(clearFace(volumes, volume.id, name))} disabled={saving} style={{ ...linkButton, color: '#8b8d91' }}>
                      <X size={15} />
                    </button>
                  )}
                </div>
              );
            })}
            {customFor === volume.id ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Face name" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
                <button onClick={() => handleAddCustom(volume.id)} disabled={!customName.trim() || customTaken} style={smallButton}>Add face</button>
              </div>
            ) : (
              <button onClick={() => { setCustomFor(volume.id); setCustomName(''); }} style={{ ...linkButton, fontSize: 13, marginTop: 8 }}>+ Custom face</button>
            )}
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input value={newVolumeName} onChange={(e) => setNewVolumeName(e.target.value)} placeholder="e.g. Vol1" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
        <button onClick={handleAddVolume} disabled={!newVolumeName.trim() || saving} style={{ ...primaryButton(Boolean(newVolumeName.trim()) && !saving), display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Add volume
        </button>
      </div>
    </div>
  );
}
```

Note: the `+ Custom face` button's accessible name is its text; the `Add volume` button's accessible name is "Add volume" (the icon has no text).

- [ ] **Step 5: Wire into `board-app/src/App.jsx`**

1. Imports: add `Triangle` to the lucide import; add `saveVolumes` to the `./lib/board` import; change the overlays import to `import { ChalkRing, FaceShape, HoldLabels, VolumeMarks } from './HoldOverlays';`; change the volumes import to `import { isPinned, faceListLines, setFace } from './lib/volumes';`; add `import VolumesScreen from './volumes/VolumesScreen';`.

2. State, after `const [savingWarmup, setSavingWarmup] = useState(false);`:

```jsx
  // While marking a volume face in setup, photo taps add its corners (or its pin).
  const [marking, setMarking] = useState(null);
  const [savingVolumes, setSavingVolumes] = useState(false);
```

3. After `const activePhotoUrl = …;`:

```jsx
  const volumes = board?.volumes || [];
```

4. Handlers, after `handleSaveWarmup`:

```jsx
  const handleSaveVolumes = async (next) => {
    setSavingVolumes(true);
    setError('');
    let saved = false;
    try {
      setBoard(await saveVolumes(board.id, next));
      saved = true;
    } catch (err) {
      console.error(err);
      setError('Could not save the volumes — check your connection and try again.');
    }
    setSavingVolumes(false);
    return saved;
  };

  // A failed save leaves marking open with its points, so Done (or another
  // tap, for a pin) retries without starting over.
  const finishMarking = async (points) => {
    if (await handleSaveVolumes(setFace(volumes, marking.volumeId, marking.name, points, board.photo_url))) {
      setMarking(null);
    }
  };
```

5. At the very top of `handleImageClick`, replacing `if (view !== 'new') return;`:

```jsx
    if (view === 'volumes') {
      if (!marking || savingVolumes) return;
      const rect = imgWrapRef.current.getBoundingClientRect();
      const point = pointFromClientCoords(rect, e.clientX, e.clientY);
      if (marking.mode === 'pin') finishMarking([point]);
      else setMarking((m) => ({ ...m, points: [...m.points, point] }));
      return;
    }
    if (view !== 'new') return;
```

6. Photo panel: change the wrapper's cursor to
`cursor: view === 'new' || (view === 'volumes' && marking) ? 'crosshair' : 'default',`
and, right after the `HoldLabels` map line from Task 3, add:

```jsx
          {view === 'volumes' && <VolumeMarks volumes={volumes} photoUrl={board?.photo_url} marking={marking} />}
```

7. Entry button: replace the list view's photo-upload block

```jsx
        {view === 'list' && (
          <div style={{ marginTop: 12 }}>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
```

so the wrapper becomes a row and the label grows, adding the button after the `</label>`:

```jsx
        {view === 'list' && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <label style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              …unchanged…
            </label>
            {board?.photo_url && (
              <button onClick={() => { setMarking(null); setView('volumes'); }} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed #3a3b3e',
                borderRadius: 10, padding: '10px 14px', fontSize: 13.5, color: '#a9abaf', cursor: 'pointer',
              }}>
                <Triangle size={15} /> Volumes
              </button>
            )}
          </div>
        )}
```

8. Render, after the `view === 'warmup-run'` block:

```jsx
        {view === 'volumes' && (
          <VolumesScreen
            volumes={volumes}
            photoUrl={board?.photo_url}
            marking={marking}
            saving={savingVolumes}
            onSave={handleSaveVolumes}
            onStartMarking={(m) => { window.scrollTo(0, 0); setMarking({ ...m, points: [] }); }}
            onUndoPoint={() => setMarking((m) => ({ ...m, points: m.points.slice(0, -1) }))}
            onFinishOutline={() => finishMarking(marking.points)}
            onCancelMarking={() => setMarking(null)}
          />
        )}
```

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: PASS, including the 8 new setup tests.

- [ ] **Step 7: Commit and push**

```bash
git add src/volumes/VolumesScreen.jsx src/HoldOverlays.jsx src/App.jsx src/App.test.jsx
git commit -m "feat: mark volume faces on the board photo

Outline a face by its corners, or pin one the photo can't show.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 5: Face buttons and the hold menu in the hold editor

**Files:**
- Create: `board-app/src/volumes/FaceButtons.jsx`, `board-app/src/volumes/HoldMenu.jsx`
- Modify: `board-app/src/App.jsx` (draft keys, menu state, tap handling, face buttons, save)
- Test: `board-app/src/App.test.jsx` (new tests; rewrite two existing removal tests)

**Interfaces:**
- Consumes: `facesOnPhoto`, `faceHold`, `GRIPS` (Task 1); `cleanHold`, face-skipping `holdAtPoint` (Task 2); `volumes` (Task 4)
- Produces:
  - `FaceButtons({ rows, holds, colors, onTap(volume, face, placedHold | undefined) })` — button accessible name `"<Volume> <Face>"`, `aria-pressed` when placed
  - `HoldMenu({ hold, color, onChange(patch), onRemove(), onDone() })` — buttons named `Left hand`, `Right hand`, `Undercut`, `Pinch`, `Gaston`, `Sidepull`, `Remove`, `Done`

- [ ] **Step 1: Rewrite the two existing removal tests**

In `board-app/src/App.test.jsx`, replace the body end of `'removes a highlighted hold when tapping it again, instead of placing a new one'` — rename it to `'opens the hold menu when tapping a highlighted hold, and Remove takes it off'` — so that after the second `fireEvent.click(photo.parentElement, { clientX: 210, clientY: 110 });` it reads:

```js
    expect(screen.getByRole('group', { name: 'Hold menu' })).toBeInTheDocument();
    expect(screen.getByTestId('hold-highlight')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.queryByTestId('hold-highlight')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hold-marker')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Hold menu' })).not.toBeInTheDocument();
```

Rename `'removes a hold when tapping directly on it while editing, instead of adding a new one'` to `'removes a hold from the hold menu while editing, instead of adding a new one'` and replace its last two lines with:

```js
    fireEvent.click(photo.parentElement, { clientX: 40, clientY: 30 });
    expect(screen.getAllByTestId('hold-marker')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.queryByTestId('hold-marker')).not.toBeInTheDocument();
```

- [ ] **Step 2: Write the new failing tests**

Append to `board-app/src/App.test.jsx`:

```js
describe('App (faces and tags in the hold editor)', () => {
  const PHOTO = 'https://cdn.example/b1.jpg';
  const OLD = 'https://cdn.example/old.jpg';
  const TOP = [{ x: 0.25, y: 0.125 }, { x: 0.75, y: 0.125 }, { x: 0.5, y: 0.5 }];
  const VOLUMES = [{ id: 'v1', name: 'Vol1', faces: [
    { id: 'f1', name: 'Top', points: TOP, photoUrl: PHOTO },
    { id: 'f9', name: 'Left', points: [{ x: 0.1, y: 0.9 }], photoUrl: OLD },
  ] }];
  const TOP_FACE = { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: TOP };

  beforeEach(() => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: PHOTO, volumes: VOLUMES });
  });

  function mockPhotoRect(photo, width = 200, height = 100) {
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width, height, right: width, bottom: height,
    });
  }

  it('adds a face from its button and saves a faces-only problem without a highlight image', async () => {
    createProblem.mockResolvedValue({ id: 'p1', name: 'Vol Line', grade: '', setter: '', notes: '', holds: [] });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));

    expect(screen.queryByRole('button', { name: 'Vol1 Left' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    expect(screen.getByRole('button', { name: 'Vol1 Top' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('face-shape')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('e.g. Gaston Traverse'), 'Vol Line');
    await user.click(screen.getByText('Save problem'));

    await waitFor(() => expect(createProblem).toHaveBeenCalledWith('b1', {
      name: 'Vol Line', grade: '', setter: '', notes: '',
      holds: [{ x: 0.5, y: 0.25, type: 'start', face: TOP_FACE }],
      photoUrl: PHOTO,
    }));
    expect(uploadProblemMask).not.toHaveBeenCalled();
  });

  it('tags a placed face with hand and grip from the hold menu', async () => {
    createProblem.mockResolvedValue({ id: 'p1', name: 'Vol Line', grade: '', setter: '', notes: '', holds: [] });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));

    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    expect(screen.getByText('Vol1 Top · start')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Right hand' }));
    await user.click(screen.getByRole('button', { name: 'Undercut' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('group', { name: 'Hold menu' })).not.toBeInTheDocument();
    expect(screen.getByText('R UC')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('e.g. Gaston Traverse'), 'Vol Line');
    await user.click(screen.getByText('Save problem'));
    await waitFor(() => expect(createProblem).toHaveBeenCalledWith('b1', expect.objectContaining({
      holds: [{ x: 0.5, y: 0.25, type: 'start', hand: 'R', grip: 'undercut', face: TOP_FACE }],
    })));
  });

  it('clears a tag by tapping it again', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));

    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    await user.click(screen.getByRole('button', { name: 'Left hand' }));
    expect(screen.getByRole('button', { name: 'Left hand' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Left hand' }));
    expect(screen.getByRole('button', { name: 'Left hand' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('tag-pill')).not.toBeInTheDocument();
  });

  it('closes the hold menu on a photo tap without placing a hold', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    mockPhotoRect(photo);

    fireEvent.click(photo.parentElement, { clientX: 20, clientY: 90 });
    expect(screen.getAllByTestId('hold-marker')).toHaveLength(1);
    fireEvent.click(photo.parentElement, { clientX: 20, clientY: 90 });
    expect(screen.getByRole('group', { name: 'Hold menu' })).toBeInTheDocument();

    fireEvent.click(photo.parentElement, { clientX: 180, clientY: 10 });
    expect(screen.queryByRole('group', { name: 'Hold menu' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('hold-marker')).toHaveLength(1);
  });

  it('places a hold on a lit face instead of selecting the face', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    mockPhotoRect(photo);

    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    // Centre of the Top face.
    fireEvent.click(photo.parentElement, { clientX: 100, clientY: 25 });

    expect(screen.getAllByTestId('hold-marker')).toHaveLength(1);
    expect(screen.queryByRole('group', { name: 'Hold menu' })).not.toBeInTheDocument();
  });

  it("keeps a hold's highlight when it's tagged before the highlight finishes", async () => {
    loadSegmenter.mockResolvedValue({ device: 'webgpu' });
    computeEmbedding.mockResolvedValue({ width: 400, height: 200 });
    let resolveMask;
    maskAtPoint.mockReturnValue(new Promise((resolve) => { resolveMask = resolve; }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    mockPhotoRect(photo, 400, 200);
    await waitFor(() => expect(computeEmbedding).toHaveBeenCalled());

    fireEvent.click(photo.parentElement, { clientX: 200, clientY: 180 });
    fireEvent.click(photo.parentElement, { clientX: 200, clientY: 180 });
    await user.click(screen.getByRole('button', { name: 'Left hand' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await act(async () => resolveMask({ width: 400, height: 200, data: new Uint8Array(400 * 200).fill(1) }));
    expect(screen.getByTestId('hold-highlight')).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
  });

  it('saves the highlight image from the segmented holds only when a face is in the problem', async () => {
    loadSegmenter.mockResolvedValue({ device: 'webgpu' });
    computeEmbedding.mockResolvedValue({ width: 400, height: 200 });
    const mask = { width: 400, height: 200, data: new Uint8Array(400 * 200) };
    maskAtPoint.mockResolvedValue(mask);
    const blob = new Blob(['mask'], { type: 'image/png' });
    compositeMaskBlob.mockResolvedValue(blob);
    createProblem.mockResolvedValue({ id: 'p1', name: 'Vol Line', grade: '', setter: '', notes: '', holds: [] });
    uploadProblemMask.mockResolvedValue({ id: 'p1', name: 'Vol Line', grade: '', setter: '', notes: '', holds: [], mask_url: 'https://cdn.example/m.png' });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    mockPhotoRect(photo, 400, 200);

    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    await waitFor(() => expect(computeEmbedding).toHaveBeenCalled());
    fireEvent.click(photo.parentElement, { clientX: 200, clientY: 180 });
    await waitFor(() => expect(screen.getByTestId('hold-highlight')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('e.g. Gaston Traverse'), 'Vol Line');
    await user.click(screen.getByText('Save problem'));

    await waitFor(() => expect(uploadProblemMask).toHaveBeenCalledWith('p1', blob));
    expect(compositeMaskBlob).toHaveBeenCalledWith([{ mask, color: '#2E6B3E' }], 400, 200);
  });

  it("only offers faces marked on the photo of the problem being edited", async () => {
    listProblems.mockResolvedValue([{
      id: 'p1', name: 'Old Line', grade: 'V2', setter: 'Rob', notes: '', photo_url: OLD,
      holds: [{ x: 0.2, y: 0.3, type: 'start' }],
    }]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Old Line'));
    await user.click(await screen.findByRole('button', { name: 'Edit holds' }));

    expect(screen.getByRole('button', { name: 'Vol1 Left' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vol1 Top' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/App.test.jsx`
Expected: FAIL — the rewritten removal tests and every new editor test.

- [ ] **Step 4: Create `board-app/src/volumes/FaceButtons.jsx`**

```jsx
// One row per volume with faces on the photo being edited. A placed face's
// button fills in its hold type's colour; tapping it again opens its menu.
export default function FaceButtons({ rows, holds, colors, onTap }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      {rows.map(({ volume, faces }) => (
        <div key={volume.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ width: 52, fontSize: 12.5, fontWeight: 700, color: '#8b8d91' }}>{volume.name}</span>
          {faces.map((face) => {
            const placed = holds.find((h) => h.face?.faceId === face.id);
            const color = placed ? colors[placed.type] : null;
            return (
              <button
                key={face.id}
                aria-label={`${volume.name} ${face.name}`}
                aria-pressed={Boolean(placed)}
                onClick={() => onTap(volume, face, placed)}
                style={{
                  padding: '6px 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${color || '#3a3b3e'}`, background: color || 'transparent',
                  color: color ? '#17181A' : '#c7c8cb',
                }}
              >{face.name}</button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create `board-app/src/volumes/HoldMenu.jsx`**

```jsx
import { Trash2 } from 'lucide-react';
import { GRIPS } from '../lib/volumes';
import { primaryButton } from '../ui';

const TYPE_NAMES = { start: 'Start hold', hold: 'Hold', foot: 'Foothold', finish: 'Finish hold' };
const HANDS = [{ value: 'L', name: 'Left hand' }, { value: 'R', name: 'Right hand' }];

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      <span style={{ width: 44, fontSize: 12, color: '#8b8d91', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      {children}
    </div>
  );
}

export default function HoldMenu({ hold, color, onChange, onRemove, onDone }) {
  const title = hold.face ? `${hold.face.label} · ${hold.type}` : TYPE_NAMES[hold.type];
  // One hand and one grip at most; tapping the selected one clears it.
  const toggle = (field, value) => onChange({ [field]: hold[field] === value ? undefined : value });
  const chip = (selected) => ({
    padding: '6px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${selected ? color : '#3a3b3e'}`, background: selected ? color : 'transparent',
    color: selected ? '#17181A' : '#c7c8cb',
  });
  return (
    <div role="group" aria-label="Hold menu" style={{ background: '#232427', border: `1px solid ${color}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color, marginBottom: 10 }}>{title}</div>
      <Row label="Hand">
        {HANDS.map((h) => (
          <button key={h.value} aria-label={h.name} aria-pressed={hold.hand === h.value} onClick={() => toggle('hand', h.value)} style={chip(hold.hand === h.value)}>{h.value}</button>
        ))}
      </Row>
      <Row label="Grip">
        {GRIPS.map((g) => (
          <button key={g.value} aria-pressed={hold.grip === g.value} onClick={() => toggle('grip', g.value)} style={chip(hold.grip === g.value)}>{g.label}</button>
        ))}
      </Row>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <button onClick={onRemove} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#D9552B', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', padding: 0 }}>
          <Trash2 size={14} /> Remove
        </button>
        <button onClick={onDone} style={primaryButton(true)}>Done</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire into `board-app/src/App.jsx`**

1. Imports: `import { pointFromClientCoords, validateDraft, holdAtPoint, cleanHold } from './lib/holds';`; volumes import becomes `import { isPinned, faceListLines, setFace, facesOnPhoto, faceHold } from './lib/volumes';`; add `import FaceButtons from './volumes/FaceButtons';` and `import HoldMenu from './volumes/HoldMenu';`.

2. State, after `const [placeType, setPlaceType] = useState('start');`:

```jsx
  // Which draft hold the hold menu is open for, by its draft-only _key -- a
  // hold object is replaced when its mask lands or a tag changes, so neither
  // identity nor index can track it.
  const [menuKey, setMenuKey] = useState(null);
  const nextKeyRef = useRef(0);
```

and a helper right after `const imgWrapRef = useRef(null);` block's refs (after `const embeddingRef = useRef(null);`):

```jsx
  const withKey = (hold) => ({ ...hold, _key: nextKeyRef.current++ });
```

3. In the segmentation effect's edit-seeding loop, change `if (h._mask) return;` to `if (h._mask || h.face) return;` (faces never go through segmentation), and change the match `(hh === h ? …` to `(hh._key === h._key ? …`; update its comment's "Matched by object identity (not index)" to "Matched by _key (not index or identity)".

4. `startEditProblem`: change `setDraftHolds(problem.holds);` to `setDraftHolds(problem.holds.map(withKey));` and add `setMenuKey(null);`.

5. `startNewProblem`: add `setMenuKey(null);`.

6. `saveProblem`: replace

```jsx
      const cleanHolds = draftHolds.map(({ x, y, type }) => ({ x, y, type }));
      const allMasked = draftHolds.length > 0 && draftHolds.every((h) => h._mask);
```

with

```jsx
      const cleanHolds = draftHolds.map(cleanHold);
      // Faces are drawn from their own outline and never segmented, so only the
      // other holds decide whether there's a complete highlight image to save.
      const segmented = draftHolds.filter((h) => !h.face);
      const allMasked = segmented.length > 0 && segmented.every((h) => h._mask);
```

and in both `compositeMaskBlob(` calls change `draftHolds.map(` to `segmented.map(`.

7. `handleImageClick`, the `'new'` part: directly after `if (view !== 'new') return;` add

```jsx
    // With the menu open, a tap just closes it, so a mis-tap can't add a stray hold.
    if (menuKey !== null) { setMenuKey(null); return; }
```

replace the hit branch

```jsx
    if (hitIndex !== -1) {
      setDraftHolds((prev) => prev.filter((_, i) => i !== hitIndex));
      return;
    }

    const newHold = { ...point, type: placeType };
```

with

```jsx
    if (hitIndex !== -1) {
      setMenuKey(draftHolds[hitIndex]._key);
      return;
    }

    const newHold = withKey({ ...point, type: placeType });
```

and in that function's mask `.then`, change `(h === newHold ? …` to `(h._key === newHold._key ? …`.

8. Handlers, after `handleImageClick`:

```jsx
  const handleFaceTap = (volume, face, placed) => {
    if (placed) { setMenuKey(placed._key); return; }
    const hold = withKey(faceHold(volume, face, placeType));
    setDraftHolds((prev) => [...prev, hold]);
  };

  const updateMenuHold = (patch) => {
    setDraftHolds((prev) => prev.map((h) => (h._key === menuKey ? { ...h, ...patch } : h)));
  };

  const removeMenuHold = () => {
    setDraftHolds((prev) => prev.filter((h) => h._key !== menuKey));
    setMenuKey(null);
  };
```

9. Derived values, after `const detailPhotoStatus = …;`:

```jsx
  const faceRows = view === 'new' ? facesOnPhoto(volumes, activePhotoUrl) : [];
  const menuHold = menuKey === null ? null : draftHolds.find((h) => h._key === menuKey) || null;
```

10. In the `view === 'new'` controls, insert before the hold-type button row (`<div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>`):

```jsx
                {menuHold && (
                  <HoldMenu
                    hold={menuHold}
                    color={HOLD_COLORS[menuHold.type]}
                    onChange={updateMenuHold}
                    onRemove={removeMenuHold}
                    onDone={() => setMenuKey(null)}
                  />
                )}
```

and after the hold-type button row's closing `</div>`:

```jsx
                <FaceButtons rows={faceRows} holds={draftHolds} colors={HOLD_COLORS} onTap={handleFaceTap} />
```

and change the hint text to: `Pick a hold type, then tap the board photo above to place one — tap a placed hold to tag or remove it.`

- [ ] **Step 7: Run the whole suite and lint**

Run: `npx vitest run && npx oxlint`
Expected: all tests PASS; no lint errors.

- [ ] **Step 8: Commit and push**

```bash
git add src/volumes/FaceButtons.jsx src/volumes/HoldMenu.jsx src/App.jsx src/App.test.jsx
git commit -m "feat: add volume faces to problems and tag holds with hand and grip

Tapping a placed hold now opens a menu to tag or remove it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 6: Verify the build

- [ ] **Step 1: Build**

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 2: Full suite**

Run: `npx vitest run`
Expected: all PASS (184 existing + the new tests).

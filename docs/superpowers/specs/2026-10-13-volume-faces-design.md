# Volume Faces & Hold Tags — Design

**Date:** 2026-10-13
**Status:** Approved in brainstorming, awaiting spec review

## Goal

The board has bolted-on volumes (currently Vol1 and Vol2), and problems use
individual faces of them — "Start: Vol1 Top", "Vol2 Right for left hand",
"only undercuts on the green volume". Highlight mode can't pick out a face
(a tap on plain plywood segments the whole volume or the bolt-on sitting on
it), so today all of this lives in the notes.

This change makes volume faces first-class holds, and lets any hold carry
which hand and what grip:

1. **Mark each volume's faces once** on the board photo — an outline for a
   face you can see, a single pin for one you can't (e.g. a lower volume's
   underside, where only the hold coming off it is visible).
2. **Add faces to a problem from buttons** — `Vol1 [Top] [Left] [Right]` —
   with the normal start / hold / foot / finish types.
3. **Tag any hold or face** with hand (L / R) and grip (undercut, pinch,
   gaston, sidepull).

The board won't move for at least a year, so marking faces is a one-off.

### How the examples map

| Notes today | With this change |
|---|---|
| Start: Vol1 Top | Vol1 Top face, type Start |
| Vol2 Right for left hand | Vol2 Right face, type Hold, hand L |
| Vol2 Top for right hand | Vol2 Top face, type Hold, hand R |
| Only undercuts on green volume | each of that volume's faces used, grip Undercut |
| Left hand to higher volume pinch, right hand to undercling on lower volume | Vol1 face L + Pinch; Vol2 face R + Undercut |

## Decisions

| Question | Decision |
|---|---|
| Where face shapes live | Marked once per board, stored on `boards.volumes` |
| Visible vs hidden faces | Outlined (3+ corner taps) or pinned (1 tap) |
| Face names | Presets Top / Left / Right / Under, plus a typed custom name |
| Adding a face to a problem | Buttons under the hold-type picker, not photo taps |
| Photo taps on a lit face | Ignored for faces — they always place/edit the hold under the finger, so bolt-ons on volumes still work |
| Problem copy of a face | Each face hold carries its own snapshot of label + points |
| Retaking the board photo | Faces remember the photo they were marked on; only faces on the photo being edited are offered |
| How faces are drawn | SVG overlay from the hold data, styled like a hold highlight — not baked into the saved highlight image |
| Hand / grip | Optional `hand` and `grip` on any hold, set from a hold menu |
| Tapping a placed hold | Opens the hold menu (Remove lives there) instead of removing straight away |

## Data

### SQL (the user runs this in the Supabase SQL editor)

```sql
alter table boards add column volumes jsonb not null default '[]'::jsonb;
```

Existing table, so RLS is unaffected. Safe to run before the code ships:
the board is loaded with `select('*')` and the current code ignores the
extra field.

### `boards.volumes`

```js
[
  {
    id: 'v-…',
    name: 'Vol1',
    faces: [
      // 3+ points = outlined face; exactly 1 point = pinned face
      { id: 'f-…', name: 'Top', points: [{ x, y }, { x, y }, { x, y }], photoUrl: 'https://…' },
      { id: 'f-…', name: 'Under', points: [{ x, y }], photoUrl: 'https://…' },
    ],
  },
]
```

- Points are fractions of the photo (0–1), the same space as hold `x`/`y`.
- `photoUrl` is per face: the board photo it was marked on. A face whose
  `photoUrl` isn't the board's current photo shows "Old photo — re-mark" in
  setup. Re-marking replaces its points and `photoUrl`.
- Ids come from `crypto.randomUUID()`, with the same non-secure-context
  fallback `uploadBoardPhoto` uses.
- A face that hasn't been marked isn't stored; preset rows with no entry
  show as "Not marked".

### Holds on `problems.holds` (existing jsonb — no schema change)

```js
{ x, y, type }                                   // today, unchanged
{ x, y, type, hand: 'L', grip: 'pinch' }          // tagged normal hold
{ x, y, type, hand: 'R', face: {                  // face hold
    volumeId: 'v-…', faceId: 'f-…',
    label: 'Vol2 Right',
    points: [{ x, y }, …],
} }
```

- `hand`: `'L' | 'R'`, omitted when unset. `grip`: `'undercut' | 'pinch' |
  'gaston' | 'sidepull'`, omitted when unset.
- A face hold's `x`/`y` is the average of its points (the pin itself for a
  pinned face) — used to place its tag label and ring.
- `label` and `points` are a snapshot. Re-marking or deleting a face later
  never changes a problem already set with it, matching how each problem
  keeps its own `photo_url`.
- Old problems have none of the new fields and render exactly as now.

### `src/lib/board.js` addition

- `saveVolumes(boardId, volumes)` — `update({ volumes })` on `boards`,
  returns the updated board. Same shape as `saveWarmup`.

## Screens

### Volumes setup (new view `'volumes'`)

Entry: a `Volumes` button beside `Replace board photo` on the list view,
shown only once the board has a photo. Back is the existing `‹ Board`.

- The photo shows every face marked on the current photo: outlines in a
  neutral colour, pins as rings, each labelled (`Vol1 Top`).
- One card per volume: its name, then a row per face — the four presets plus
  any custom faces. Each row shows its state (`Outlined` / `Pinned` /
  `Not marked` / `Old photo — re-mark`) and buttons `Outline`, `Pin`, and
  `✕` (clear, when marked).
- `+ Custom face` on a card takes a typed name (unique within the volume)
  and adds a `Not marked` row for it. Like a preset, it's only stored once
  it's outlined or pinned.
- `Delete volume` on each card, with an inline confirm.
- `+ Add volume` takes a name (e.g. `Vol3`).

**Marking.** `Outline` puts the photo into marking mode with a banner
"Tap the corners of Vol1 Top" and `Undo point` / `Done` / `Cancel`. The
outline draws live as corners are tapped. `Done` needs 3+ points. `Pin`
shows "Tap where Vol2 Under is"; the first tap finishes it.

**Saving.** Every completed change (add volume, finish marking, clear a
face, delete a volume) calls `saveVolumes` straight
away, then updates local state from the returned board. On failure the
standard error banner shows and marking mode stays open, so `Done` can be
retried without re-tapping corners.

`App.jsx` owns the marking state and routes photo taps to it while marking,
the same way it routes taps for the hold editor; the cards live in
`src/volumes/VolumesScreen.jsx`.

### Setting a problem (hold editor, view `'new'`)

**Face buttons.** Below the start / hold / foot / finish row, one line per
volume that has at least one face marked on the photo being edited
(`activePhotoUrl` — the problem's own photo when editing an older one):

```
Vol1   [Top] [Left] [Right]
Vol2   [Top] [Right] [Under]
```

- Tapping an unplaced face adds a face hold with the selected hold type.
  The button then fills in that type's colour.
- Tapping a placed face opens the hold menu for it. A face can be in a
  problem once.
- Face buttons work immediately — they don't wait for "Preparing highlight
  mode…", since faces never go through segmentation.
- No volumes on this photo → no face rows (and no extra UI at all).

**Photo taps.** Unchanged for empty space: they place a hold of the
selected type. Hit-testing (`holdAtPoint`) skips face holds, so a tap on a
bolt-on sitting on a lit face places or selects the bolt-on.

**Hold menu.** Tapping a placed hold on the photo, or a placed face's
button, opens a panel under the photo:

```
VOL2 RIGHT · HOLD            (or "START HOLD" for a normal hold)
Hand   [L] [R]
Grip   [Undercut] [Pinch] [Gaston] [Sidepull]
[Remove]                                [Done]
```

- One hand and one grip at most; tapping the selected one clears it.
- `Remove` removes the hold and closes the menu. `Done` closes it.
- While the menu is open, a tap on the photo just closes it — no hold is
  placed — so a mis-tap can't add a stray hold.
- The menu tracks its hold by a draft-only `_key`, since a hold object is
  replaced when its highlight mask arrives. `_`-prefixed fields are
  stripped on save, as `_mask` / `_maskUrl` are now.

**Saving.** `saveProblem` keeps `hand`, `grip` and `face` (via a pure
`cleanHold` in `src/lib/holds.js` replacing the inline `{ x, y, type }`
mapping). The composited highlight image is saved when highlight mode is
ready and **every non-face hold** has a mask; it contains only the
segmented holds — faces are drawn on top from the hold data.

**Editing holds of an existing problem.** The decode loop that re-segments
each saved hold skips face holds.

### Drawing (shared photo panel — detail, editor, warm-up)

Rendered from the hold list on top of the saved highlight image, or the
chalk-ring fallback, so they show anywhere the photo panel shows a problem:

- **Outlined face:** an absolutely positioned SVG polygon (`viewBox="0 0 1
  1"`, `preserveAspectRatio="none"`) filled in the hold-type colour at the
  hold highlight's fill alpha (0.65), with a darker stroke of the same
  colour (`vector-effect: non-scaling-stroke`), so it reads like a
  segmented hold.
- **Pinned face:** a `ChalkRing` in the hold-type colour at the pin, with a
  small label beside it: `Vol2 Under`.
- **Tag label:** a small pill just below-right of the hold's `x`/`y` with
  hand then grip — `L`, `R UC`, `L Pinch`, `Gaston`. Undercut shortens to
  `UC`; the other grips are short enough to show in full. A pinned face's
  pill joins its name: `Vol2 Under · R UC`.

### Problem detail — written list

Under the photo, when the problem has any face holds, a `Volumes` section
lists them in placement order:

```
Vol1 Top — start
Vol2 Right — hold · left hand
Vol2 Top — hold · right hand · undercut
```

Normal tagged holds aren't listed (there'd be no way to say which hold
"Hold · right hand" means); their tags show on the photo only.

## Pure module `src/lib/volumes.js`

```js
FACE_PRESETS                       // ['Top', 'Left', 'Right', 'Under']
GRIPS                              // [{ value: 'undercut', label: 'Undercut', short: 'UC' }, …]
isPinned(face)                     // points.length === 1
faceCenter(points)                 // average of the points
facesOnPhoto(volumes, photoUrl)    // -> [{ volume, faces }] with only faces marked on that photo, empty volumes dropped
faceHold(volume, face, type)       // -> a face hold (snapshot label + points, x/y at the centre)
tagLabel(hold)                     // -> 'R UC' | 'L Pinch' | '' 
faceListLines(holds)               // -> ['Vol1 Top — start', …]
addVolume / removeVolume / setFace / clearFace  // immutable updaters; setFace creates or replaces a face by name
```

## Error handling

Follows the existing pattern: failed Supabase calls log to the console and
set the error banner with a "check your connection and try again" message.
Setup keeps marking mode open on a failed save. Problem saving is unchanged.

## Testing

- `src/lib/volumes.test.js` (TDD): `isPinned`, `faceCenter`,
  `facesOnPhoto` (filters by photo, drops volumes with nothing on it),
  `faceHold` snapshot, `tagLabel` combinations, `faceListLines` (faces only,
  placement order, hand/grip wording), each updater leaves the input
  untouched.
- `src/lib/holds.test.js`: `holdAtPoint` skips face holds; `cleanHold`
  keeps `hand` / `grip` / `face`, drops unset fields and `_` fields.
- `src/lib/board.test.js`: `saveVolumes` against the mocked client.
- `src/App.test.jsx`:
  - Setup: add a volume; outline a face (3 taps + Done → `saveVolumes`
    with the points and current `photoUrl`); pin a face (1 tap); Done
    disabled under 3 points; failed save keeps marking open.
  - Editor: face buttons appear only for faces on the photo being edited;
    a face button adds a face hold that's saved; tapping a placed hold
    opens the menu, sets hand and grip, Remove removes it; the composite
    still uploads when every non-face hold is masked.
  - Detail: outlined face polygon, pinned face label, tag pill, and the
    Volumes list render from the holds.
  - Update the two existing "removes a hold when tapping it" tests to tap →
    menu → Remove.

## Out of scope

Pinch-zoom while marking, renaming volumes or faces, changing a hold's type
from the menu, more grip types (crimp, sloper, jug…), filtering or sorting
by volume, volume-wide default rules ("undercuts only" set once per volume),
migrating existing notes, baking faces into the saved highlight image.

## Changes after trying it (2026-10-13)

- **Hand / grip tags removed.** Problems shouldn't prescribe beta — working
  out how to use a hold is part of climbing it. The hold menu went with them:
  tapping a placed hold removes it again, and tapping a placed face's button
  takes the face off. Tags saved while it existed are dropped on the next save.
- **Sides are listed per volume and can be renamed.** A new volume starts with
  Top / Left / Right (Under is no longer a default); any side can be renamed,
  added or removed, and volumes can be renamed. Volumes saved earlier gain the
  implied sides on load. Problems show a side's current name, falling back to
  their own copy once the side is removed.

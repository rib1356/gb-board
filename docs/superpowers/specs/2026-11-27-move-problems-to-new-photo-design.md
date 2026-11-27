# Move Problems to a New Board Photo — Design

**Date:** 2026-11-27
**Status:** Agreed in brainstorming, awaiting Rob's review
**Builds on:** [MVP schema](2026-08-22-board-problem-tracker-mvp-design.md), [Volume faces](2026-10-13-volume-faces-design.md), [Tweaks](2026-10-21-tweaks-design.md)
**Size:** a project

## Why

A few holds on the board have never been used, and Rob wants to move them.
Changing the wall means a new board photo, and today every existing problem
stays on the photo it was set on ("Set on an older board photo"). That works,
but it leaves a pile of old photos to manage, and the heatmap, volume sides and
new problems all live on the new one. Rob wants to line the old photo up with
the new one in the app and move every problem across, so there's one photo
again.

The fear is that a bad move quietly breaks problems. So nothing moves until
Rob has looked at it on the new photo and either accepted it or fixed it.

Last time (21 Oct) Claude did this by script: 48 problems, an automatic
photo match, most came out right, a handful needed hand fixes because holds
had actually changed. The backup was deleted afterwards, so there was no undo.
This tool makes that repeatable by Rob, on his phone, with an undo.

Today: 65 problems and 15 volume sides, all on the 21 Oct photo; every problem
has a highlight image; 29 problems use a volume side.

## Goals

1. **Line up**: Rob taps the same spots on the old and new photo; the app
   works out how one maps onto the other (including a change of camera
   angle) and shows the old photo faded over the new one to check it.
2. **Check, one problem at a time**: each problem on the old photo is shown
   drawn on the new photo. Rob either **Accepts** it (it moves now) or
   **Fixes** it (re-places its holds on the new photo, then it moves).
3. Volume sides move to the new photo when the line-up is confirmed.
4. Every move can be undone per problem (**Put back**): the old photo, holds
   and highlight are kept.
5. Rob can stop at any point and carry on later. Problems not yet checked
   stay exactly as they are today.
6. Tips for taking a new photo that lines up well.

## Non-goals

- Automatic photo matching, or a see-through camera for taking the photo
  (considered; may come later if tapping is a pain).
- Detecting which holds changed on the wall.
- Deleting old photos or old highlight images from storage.
- Anything for warm-ups, projects, ticks or votes — they point at problems by
  id and don't care which photo a problem is on.
- A bulk "put everything back" button (the data is kept, so it can be added
  or scripted if ever needed).

## Anti-goals

- A problem Rob hasn't accepted or fixed must never change.
- The pre-move photo, holds and highlight must never be lost or overwritten.
- It must be usable on Rob's phone, one-handed at the wall. A desktop-only
  tool is a failure.
- Accepting a problem that looks right must stay one tap, with no confirm
  dialogs: with 65+ problems, any extra friction and Rob won't finish it.

## Approaches

1. **Tap matching points** *(chosen)*: Rob taps 4+ matching spots on each
   photo; the app solves the perspective transform. Always works, no new
   dependencies, ~8 taps with a loupe for precision.
2. **Automatic matching**: what the 21 Oct script did (feature matching). Zero
   taps when it works, but needs a ~10MB image library (OpenCV.js) loaded for
   this screen and can lock onto the wrong features if lighting or the wall
   changed a lot. Could be added later as a "suggest points" helper.
3. **See-through camera**: show the old photo faintly over the live camera when
   taking the new one. Helps either of the above but is a whole camera screen,
   and camera access needs HTTPS (not the LAN dev server).

Dragging/pinching an overlay by eye was ruled out: it can't correct a change
in camera angle.

Rob picked 1 plus photo tips: "go with 1, tapping points plus the photo tips."

## Design

### Where it lives

Tweaks › Board setup gets a third button beside **New photo** and **Volumes**,
shown when at least one problem's `photo_url` is not the board's current photo,
**or** any problem has a move it could be put back from (`moved_from` not
empty) — so Put back stays reachable after the last problem has moved
(*my call*):

```
Board setup
[📷 New photo]  [△ Volumes]  [⇄ Move problems · 65]
Same spot, same height, 1× lens — tape a mark on the floor.
```

The count is problems left to move; with none left the button reads
**Moved problems** and opens the check on the moved ones. The tip line under the
buttons is always shown (it's about the next photo).

If problems sit on more than one older photo, the button opens a short list
(old photo thumbnail · date · count) to pick one; each older photo gets its own
line-up. Today there is only ever one. Problems with no `photo_url` are left out.

New screens go in `board-app/src/move/` (like `warmup/`, `volumes/`), with pure
logic in `board-app/src/lib/`. `App.jsx` only wires views.

### 1. Line up

Three steps on one screen, phone-first:

```
LINE UP · old photo          1 2 3 4
┌──────────────────────────────────┐
│  old photo, numbered pins        │
└──────────────────────────────────┘
Tap 4 spots that haven't moved: bolt heads, panel corners, the edge of an
unchanged hold. Spread them out near the corners. Avoid volume tips.
                                      [Next →]
```

- **A. Old photo**: tap to drop numbered pins 1–4 (more allowed, up to 8).
  Drag a pin to adjust. While a finger is down, a round loupe (≈2.5× zoom)
  shows the spot above the finger, so the finger doesn't hide it.
- **B. New photo**: tap the same spots in the same order. While placing pin N,
  a small zoomed crop of the old photo around old pin N is shown ("find this
  spot"). Same drag + loupe.
- **C. Check**: the new photo with the old photo warped on top, a fade slider
  (0–100%, starts at 50%), and the volume sides drawn as they'll land.
  **Looks right** saves; **Adjust points** goes back to A/B with pins kept.

**Looks right** does two things:
1. Saves the line-up to `boards.alignments` (below), including a copy of every
   volume side as it was on the old photo (`sidesBefore`).
2. Moves every volume side on the old photo: each point transformed, side's
   `photoUrl` set to the new photo (via the existing `saveVolumes`).

**Redo line-up** moves the sides again from `sidesBefore` with the new
transform, so a bad first line-up never sticks in Volumes (*my call*). Sides
Rob has re-marked by hand on the new photo since (their points no longer match
the first move) are left alone.

Coming back later with a saved line-up for (old photo → current photo) goes
straight to the check, with a **Redo line-up** link. Redoing it only affects
problems not yet moved. If the board photo has been replaced again since, the
saved line-up doesn't apply (its `to` isn't the current photo) and Rob lines up
again.

### 2. Check

```
MOVE PROBLEMS        12 of 65 · 11 moved
┌──────────────────────────────────┐
│ new photo + this problem drawn   │
│ on it (moved highlight)          │
└──────────────────────────────────┘
Big bump · V5 · Set by Rob
(hold photo to compare with the old one)
[ Fix holds ]              [ Accept ✓ ]
‹ Back                          Skip ›
```

- Order: the same as the board list (newest first). Opens at the first problem
  not yet decided.
- The problem is drawn on the new photo with its holds and volume sides
  transformed and its highlight image warped (see Maths).
- **Press and hold the photo** shows the old photo (warped, so it lines up)
  with the problem's old highlight, to spot a hold that's moved. Let go to
  return.
- **Accept**: one tap, no dialog. Writes the move (below), then shows the next
  problem. A spinner on the button while saving; on failure an error line and
  it stays on this problem.
- **Fix holds**: opens the app's existing hold editor (`view === 'new'` with
  `editingId`) on the **new photo**, seeded with the transformed holds. The
  editor already re-segments each hold on the photo it shows, so highlights are
  fresh. Save writes the move with the edited holds and new highlight, then
  returns to the check at the next problem. Back returns to the same problem,
  nothing written.
- **Skip**: next problem, nothing written (stays on the old photo).
- **Back**: previous problem. A problem already moved shows "Moved ✓" and a
  **Put back** link instead of Accept: restores the last entry of `moved_from`
  exactly (photo, holds, highlight) and removes that entry. Anything edited
  after the move is lost, and the link says so in small text.
- A problem counts as moved for this line-up when its `photo_url` is the
  line-up's `to` and the last `moved_from` entry's `photo_url` is its `from`.
- Days later at the wall, a moved problem that's wrong is fixed with the normal
  Edit holds on the new photo; Put back is for the check session (the old photo
  no longer matches the wall).
- When none are left: "All moved. The old photo isn't used any more." and a
  button back to Tweaks.

### Writing a move

For one problem (Accept or Fix):

1. Upload the new highlight image (warped for Accept; composited from the
   editor's masks for Fix) to a **new, unique path** — never overwrite.
2. Update the problem in one call:
   `photo_url = <new photo>`, `holds = <new holds>`, `mask_url = <new path>`,
   and **append** `{ photo_url, holds, mask_url, moved_at }` (the values before)
   to `moved_from`. It's a list, newest last, so a problem moved twice (A → B,
   then B → C) still has A (*my call*).
3. Update the problem in App state so the list, detail and heatmap see it at
   once.

If a problem has no highlight (`mask_url` null), Accept writes `mask_url: null`
and it shows circle markers as today.

**Highlight paths become unique.** Today `uploadProblemMask` upserts
`masks/<problemId>.png`, so editing a moved problem later would overwrite the
very file `moved_from.mask_url` points at. Change it to upload to
`masks/<problemId>/<timestamp>-<unique>.png` with no upsert (the same rule as
board photos), and drop the `?t=` cache-buster since paths are now immutable.
This applies to every highlight upload, not just moves.

### Maths

All coordinates are fractions of their photo (0–1), as holds already are. A
homography `H` (3×3) maps an old-photo fraction to a new-photo fraction.

`board-app/src/lib/homography.js` (pure, unit tested):
- `solveHomography(pairs) -> number[9]` — pairs are `{ from: {x,y}, to: {x,y} }`,
  at least 4; with more than 4, least squares (DLT). Returns null if the points
  are degenerate (three in a line, repeated).
- `applyHomography(H, {x,y}) -> {x,y}`
- `invertHomography(H) -> number[9]`

`board-app/src/lib/movePhoto.js` (pure, unit tested):
- `moveHold(H, hold) -> hold` — moves `x,y`. For a face hold, moves every point
  in `face.points` and sets `x,y` to `faceCenter` of the moved points (how
  `faceHold` places a face). Keeps `type` and the face's ids/label.
- `moveVolumes(H, volumes, fromUrl, toUrl) -> volumes` — moves sides whose
  `photoUrl === fromUrl`, leaves others alone.
- `problemsToMove(problems, currentPhotoUrl) -> Map<photoUrl, problem[]>`.
- `warpImageData(src: ImageData, Hinv, outWidth, outHeight) -> ImageData` —
  for each output pixel, map back with the inverse and sample the source
  (nearest-neighbour is fine for highlights; pixels that map outside are
  transparent). Pure so it can be tested on tiny arrays.

The warped highlight is made at the new photo's natural size. Highlight images
and photos are served from Supabase storage, which allows cross-origin reads;
load them with `crossOrigin = 'anonymous'` so the canvas can be read.

For the line-up check and the press-and-hold compare, drawing the warped old
photo can be a CSS `matrix3d` built from `H` scaled to the displayed size, or a
canvas warp — builder's call.

### Data

Rob runs this in the Supabase SQL editor before the feature ships:

```sql
alter table boards add column alignments jsonb not null default '[]';
alter table problems add column moved_from jsonb;
```

(Both tables already have their grants; new columns inherit them.)

- `boards.alignments`: `[{ from: <photo url>, to: <photo url>, pairs: [{ from: {x,y}, to: {x,y} }], sidesBefore: [{ volumeId, faceId, points }], saved_at }]`.
  Saving a line-up replaces any entry with the same `from` and `to` (keeping
  the first `sidesBefore`).
- `problems.moved_from`: a list of `{ photo_url, holds, mask_url, moved_at }`,
  newest last, or null.

Also add both columns to the schema block in the MVP spec, which is kept as the
record of the live schema.

### Photo tips

Under the Board setup buttons (shown above):
"Same spot, same height, 1× lens — tape a mark on the floor."

On the line-up screen, the point-picking tip (shown above).

## Testing it safely

There's no staging database: the local dev server uses the live data. The safe
first test is to re-shoot the **unchanged** board, upload it, line up and move
problems. With nothing changed on the wall every problem should Accept cleanly,
and Put back is there if one doesn't. Then do it for real after changing the
holds.

## Left to the builder

- Exact styling, within the app's dark style and `ui.js` helpers.
- Loupe size and zoom, pin look, how the fade slider and press-and-hold are
  drawn.
- How App state carries "fix mode" (the photo override and where Save/Back
  return to), as long as the normal Edit holds flow is unchanged.
- Whether the warped highlight is computed when a problem is shown or ahead
  of time.
- Holds that land outside the new photo after the transform (clamp or leave;
  Rob will see them in the check either way).
- Edit holds on a problem not yet moved, after the volume sides have moved:
  its photo has no sides left to add (an edge case; no special handling).
- Tests: pure maths and move logic in unit tests; App/screen tests for
  Tweaks button visibility, line-up needing 4 pairs, Accept writing the move,
  Fix opening the editor on the new photo, Put back restoring.

## Shipping

Feature branch `feat/move-problems` → Rob runs the SQL → Rob tries it on his
phone over LAN → PR to main.

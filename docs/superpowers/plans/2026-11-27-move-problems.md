# Move Problems to a New Board Photo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tweaks tool that lines an old board photo up with the new one by tapped point pairs, then lets Rob Accept / Fix / Skip / Put back each problem onto the new photo.

**Architecture:** Pure maths and move logic in `src/lib/` (homography, hold/side moving, move/put-back payloads, image warp). Two screens in `src/move/` (line-up, check) that draw the old photo and highlights over the new photo with a CSS `matrix3d`. `App.jsx` owns data writes and wires views; Fix reuses the existing hold editor with a photo override. Highlight uploads become unique-path everywhere.

**Tech Stack:** React 19, Vite, Vitest + Testing Library (jsdom: no canvas — canvas code stays in one mockable glue module), Supabase JS, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-27-move-problems-to-new-photo-design.md`

## Global Constraints

- Branch `feat/move-problems` cut from `feat/problem-search` (so Rob's phone build has search too); push every commit to it as soon as made. PR targets `main` after PR #12 is merged.
- SQL is already live: `boards.alignments jsonb not null default '[]'`, `problems.moved_from jsonb` (null or a list, newest last).
- All coordinates are photo fractions (0–1). `H` is a 9-number row-major homography mapping old-photo fraction → new-photo fraction.
- Never write a problem Rob hasn't Accepted, Fixed or Put back. Never overwrite a highlight file: every highlight upload goes to `masks/<problemId>/<Date.now()>-<unique>.png`, no upsert, no `?t=`.
- Accept is one tap, no confirm dialog.
- No new npm dependencies.
- Copy (exact): Tweaks tip `Same spot, same height, 1× lens — tape a mark on the floor.`; line-up tip `Tap 4 spots that haven't moved: bolt heads, panel corners, the edge of an unchanged hold. Spread them out near the corners. Avoid volume tips.`; degenerate fit `Those points don't give a fit — spread them out more.`; done `All moved. The old photo isn't used any more.`; put-back note `Undoes anything changed since the move.`
- Tests run from `board-app/`: `npx vitest run <file>`; full check `npm test && npm run lint && npm run build`.

## Review Focus

1. Degenerate pins (3 in a line, two on one spot) → no fit; Next/Looks right disabled with the degenerate-fit copy, never a crash (Task 1 null test; Task 4 UI test).
2. Warp or upload fails during Accept → problem unchanged, error line shown, Accept can be retried (Task 6 test).
3. Problem with no `mask_url` → Accept moves holds and writes `mask_url: null` without warping (Task 6 test).
4. Fix then Back → nothing written, returns to the same problem on the check screen (Task 6 test).
5. Redo line-up after a side was re-marked by hand → that side is left alone (Task 2 test).

---

### Task 1: Homography maths

**Files:** Create `board-app/src/lib/homography.js`, `board-app/src/lib/homography.test.js`

**Interfaces — Produces:**
- `solveHomography(pairs: {from:{x,y}, to:{x,y}}[]) -> number[9] | null` (≥4 pairs; >4 → least squares; null when fewer than 4 or degenerate)
- `applyHomography(H, {x,y}) -> {x,y}`
- `invertHomography(H) -> number[9] | null`
- `cssMatrix3d(H, width: number, height: number) -> string` — `matrix3d(...)` for an element of `width×height` px with `transform-origin: 0 0`, mapping its own fraction-space through `H` (i.e. `S·H·S⁻¹`, `S = diag(width, height, 1)`).

- [ ] **Step 1: Create branch** — from repo root: `git switch feat/problem-search && git pull && git switch -c feat/move-problems`
- [ ] **Step 2: Failing tests** in `homography.test.js`:
  - identity: 4 pairs with `from === to` (corners) → `applyHomography(H, {x:0.3,y:0.7})` ≈ `{0.3,0.7}` (`toBeCloseTo`, 6 dp).
  - shift+scale: `to = {x: 0.1 + 0.8*x, y: 0.05 + 0.9*y}` for the 4 corners → maps `{0.5,0.5}` to `{0.5,0.5}` and `{0.25,0.75}` to `{0.3,0.725}`.
  - perspective: `to` corners `{0.1,0.1},{0.9,0.05},{0.95,0.95},{0.05,0.9}` → each `from` corner maps to its `to` corner (6 dp).
  - least squares: same perspective set plus a 5th exact pair `{0.5,0.5}`→`applyHomography(H4,{0.5,0.5})` → still maps corners within 1e-6.
  - degenerate: 3 pins in a line + 1 → `null`; two pins on the same spot → `null`; 3 pairs → `null`.
  - inverse: `applyHomography(invertHomography(H), applyHomography(H, p))` ≈ `p`.
  - css: `cssMatrix3d(identity, 200, 100)` → `'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)'` (numbers normalised so `H[8]` is 1; round to 6 dp, no `-0`); for the shift+scale case at 200×100 the translate terms are `20` and `5`.
- [ ] **Step 3: Run** `npx vitest run src/lib/homography.test.js` → FAIL (module missing).
- [ ] **Step 4: Implement.** DLT: build the 2n×8 system with `h8 = 1`, solve the normal equations (`AᵀA h = Aᵀb`) by Gaussian elimination with partial pivoting; return null if a pivot `< 1e-12` or any 3 of the `from` (or `to`) points are within 1e-9 of collinear (cross product) or two coincide. Normalise points first (Hartley: centre + scale to √2 mean distance) for stability, then denormalise. `cssMatrix3d` column-major order: `a,d,0,g, b,e,0,h, 0,0,1,0, c,f,0,i` of `S·H·S⁻¹`.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit + push** `feat: homography maths for lining up board photos`.

---

### Task 2: Move logic and image warp

**Files:** Create `board-app/src/lib/movePhoto.js`, `movePhoto.test.js`, `board-app/src/lib/warpImage.js`, `warpImage.test.js`

**Interfaces:**
- Consumes: Task 1 `applyHomography`, `invertHomography`; `faceCenter` from `lib/volumes.js`.
- Produces (`movePhoto.js`):
  - `moveHold(H, hold) -> hold` — moves `x,y`; for `hold.face`, moves every `face.points` point and sets `x,y = faceCenter(movedPoints)`; keeps all other fields.
  - `olderPhotos(problems, currentPhotoUrl) -> { photoUrl, count }[]` — problems with a `photo_url` that isn't current, grouped, most problems first. Problems with no `photo_url` ignored.
  - `isMovedBy(problem, alignment) -> boolean` — `photo_url === alignment.to` and last `moved_from` entry's `photo_url === alignment.from`.
  - `checkList(problems, alignment) -> problem[]` — problems on `alignment.from` plus those `isMovedBy` it, in input order (newest first).
  - `movedFields(problem, { photoUrl, holds, maskUrl }, movedAt: string) -> { photo_url, holds, mask_url, moved_from }` — appends `{ photo_url, holds, mask_url, moved_at }` of the problem's current values to `moved_from` (null → `[]`).
  - `putBackFields(problem) -> { photo_url, holds, mask_url, moved_from }` — restores the last entry and drops it (`moved_from` becomes null when empty).
  - `sidesOnPhoto(volumes, photoUrl) -> { volumeId, faceId, points }[]`
  - `moveSides(volumes, sidesBefore, { from, to, H, prevH = null }) -> volumes` — for each `sidesBefore` entry, the matching side is moved (points = `sidesBefore.points` through `H`, `photoUrl = to`) when it is still on `from`, or when `prevH` is given and it is on `to` with points within 1e-6 of `sidesBefore.points` through `prevH`. Anything else untouched.
  - `upsertAlignment(alignments, entry) -> alignments` — replaces the entry with the same `from`+`to`, keeping the old one's `sidesBefore`; else appends.
- Produces (`warpImage.js`):
  - `warpImageData(src: {width,height,data}, Hinv, outWidth, outHeight) -> {width,height,data: Uint8ClampedArray}` — nearest-neighbour; output pixel centre `((x+0.5)/outW, (y+0.5)/outH)` → `Hinv` → source fraction → source pixel; outside → transparent.
  - `warpMaskBlob(maskUrl, newPhotoUrl, H) -> Promise<Blob>` — browser glue: loads both images with `crossOrigin = 'anonymous'`, reads the mask's pixels, warps to the new photo's natural size, returns a PNG blob. Not unit tested (jsdom has no canvas); App tests mock this module.

- [ ] **Step 1: Failing tests.** `movePhoto.test.js` (use a pure shift `H` built with Task 1's `solveHomography` so expected values are exact: `to = from + {0.1, 0.05}`):
  - `moveHold` moves a plain hold and keeps `type`; moves a 3-point face's points and sets x,y to their centre; a 1-point (pinned) face's x,y equals its moved point.
  - `olderPhotos` groups two older photos with counts `[{old1,3},{old2,1}]`, ignores current and null `photo_url`.
  - `isMovedBy` true/false cases; `checkList` keeps order and includes both unmoved-on-`from` and moved-by.
  - `movedFields` on a never-moved problem → `moved_from` length 1 holding the old values; on a problem moved once → length 2, old entry first.
  - `putBackFields` restores the last entry; with one entry → `moved_from: null`; with two → keeps the first.
  - `moveSides`: side on `from` moves; side on another photo untouched; redo with `prevH` re-moves an untouched moved side from `sidesBefore`; a moved side whose points were changed by hand is left alone.
  - `upsertAlignment` replaces same from+to keeping first `sidesBefore`; appends a new pair.
  - `warpImage.test.js`: a 2×2 RGBA source through an identity `Hinv` into 2×2 equals the source; through a shift that pushes everything off-image → all zero alpha; a 1×1 red source scaled into 4×4 is all red.
- [ ] **Step 2: Run** `npx vitest run src/lib/movePhoto.test.js src/lib/warpImage.test.js` → FAIL.
- [ ] **Step 3: Implement** both modules to the interfaces above.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push** `feat: move holds, sides and highlights between board photos`.

---

### Task 3: Storage — unique highlight paths, move writes, alignments

**Files:** Modify `board-app/src/lib/board.js`, `board-app/src/lib/board.test.js`

**Interfaces — Produces:**
- `uploadMaskFile(problemId, blob) -> Promise<string>` — uploads to `masks/<problemId>/<Date.now()>-<unique>.png` (`unique` like `uploadBoardPhoto`'s, with the same non-secure-context fallback), `contentType: 'image/png'`, no upsert; returns the public url as is.
- `uploadProblemMask(problemId, blob)` — now `uploadMaskFile` then update `mask_url` to that url (no `?t=`). Signature and return unchanged.
- `moveProblem(id, { photo_url, holds, mask_url, moved_from }) -> row` — one `update(...).eq('id', id).select().single()`.
- `saveAlignments(boardId, alignments) -> board row`.

- [ ] **Step 1: Failing tests.** Replace the `uploadProblemMask` test's expectations: upload path matches `/^masks\/p1\/\d+-[0-9a-z-]+\.png$/`, options `{ contentType: 'image/png' }` (no upsert), stored `mask_url` equals the public url with no `?t=`. Add: two `uploadMaskFile('p1', …)` calls use different paths; `moveProblem` sends exactly the four fields to `problems` filtered by id; `saveAlignments` updates `boards.alignments` by id and returns the row.
- [ ] **Step 2: Run** `npx vitest run src/lib/board.test.js` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push** `feat: never overwrite a highlight image; add move and alignment writes`.

---

### Task 4: Line-up screen

**Files:** Create `board-app/src/move/PinPhoto.jsx`, `board-app/src/move/LineUpScreen.jsx`, `board-app/src/move/LineUpScreen.test.jsx`

**Interfaces:**
- Consumes: Task 1 `solveHomography`, `cssMatrix3d`; Task 2 `sidesOnPhoto`, `moveSides`; `pointFromClientCoords` (`lib/holds.js`); `FaceShape`, `PinnedFace`/`ChalkRing` (`HoldOverlays.jsx`).
- Produces:
  - `PinPhoto({ src, alt, pins: {x,y}[], onChange(pins), maxPins = 8, lockedCount = null, finder = null })` — tap empty photo adds a pin (unless `pins.length` hits `maxPins` or `lockedCount`); pointer-down on a pin (within 22px) drags it; while a pointer is down shows a ≈2.5× loupe above the finger; numbered pins. `finder = { src, at: {x,y} }` shows a small zoomed crop of `src` around `at` labelled "Find this spot".
  - `LineUpScreen({ oldPhotoUrl, newPhotoUrl, volumes, initialPairs = null, saving, error, onSave(pairs) })` — steps `old` → `new` → `check`.

Behaviour: Step `old`: `PinPhoto` on the old photo, line-up tip copy, **Next** enabled at ≥4 pins. Step `new`: `PinPhoto` on the new photo with `lockedCount = oldPins.length` and `finder` = old photo at old pin `newPins.length` (or the pin being dragged); **Check fit** enabled when counts match and `solveHomography` isn't null, otherwise the degenerate-fit copy once counts match. Step `check`: new photo with the old photo on top transformed by `cssMatrix3d(H, w, h)` (measured from the displayed new photo), `<input type="range" aria-label="Fade">` 0–100 default 50 setting the overlay opacity, volume sides from `sidesOnPhoto(volumes, oldPhotoUrl)` drawn moved; **Adjust points** (back to `old`, pins kept), **Looks right** → `onSave(pairs)`. `initialPairs` pre-fills both pin lists.

- [ ] **Step 1: Failing tests** (`LineUpScreen.test.jsx`; mock each photo wrapper's `getBoundingClientRect` to 200×100 and tap with `fireEvent.pointerDown/Up` at `clientX/Y`):
  - `Next` disabled with 3 pins, enabled with 4; pins show numbers 1–4.
  - on the new photo a 5th tap is ignored (locked to 4).
  - 4 pins in a line on the new photo → `Those points don't give a fit — spread them out more.` and **Check fit** disabled.
  - full happy path → `Fade` slider present with value 50; **Looks right** calls `onSave` with 4 pairs whose `from`/`to` equal the tapped fractions.
  - dragging pin 2 (`pointerDown` on it, `pointerMove`, `pointerUp`) moves it instead of adding a pin.
  - `initialPairs` → opens on `old` with 4 pins already placed.
- [ ] **Step 2: Run** `npx vitest run src/move/LineUpScreen.test.jsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push** `feat: line-up screen for matching two board photos`.

---

### Task 5: Check screen

**Files:** Create `board-app/src/move/CheckScreen.jsx`, `board-app/src/move/CheckScreen.test.jsx`

**Interfaces:**
- Consumes: Task 1 `cssMatrix3d`; Task 2 `moveHold`, `isMovedBy`; `HoldHighlight`-style img, `ChalkRing`, `FaceShape`, `PinnedFace`; `gradeLabel`.
- Produces: `CheckScreen({ list, index, onIndexChange(i), alignment, H, colors, volumes, busyId, error, onAccept(problem), onFix(problem), onPutBack(problem), onRedoLineUp() })`.

Behaviour:
- Header line `"{index+1} of {list.length} · {moved} moved"`; problem name · grade label · `Set by …`.
- Photo: new photo; a not-yet-moved problem is drawn with its old `mask_url` transformed by `cssMatrix3d(H, w, h)` (or `ChalkRing`s at `moveHold` positions when no mask), faces via `moveHold`. A moved problem is drawn plainly from its own `mask_url`/holds.
- Press-and-hold the photo (pointer down ≥ 250ms, until up) shows the old photo + the problem's old highlight transformed on top, `aria-label="Old photo"`; release hides it.
- Not moved: **Fix holds**, **Accept** (spinner and disabled while `busyId === problem.id`). Moved: `Moved ✓`, **Put back** link + note copy.
- **‹ Back** (disabled at 0) and **Skip ›**; Skip at the last index shows the done state when nothing is left unmoved, else wraps to the first unmoved.
- `error` shown as a line under the buttons.
- When every problem in `list` is moved: done copy and **Back to Tweaks** (calls `onIndexChange(-1)`; App treats -1 as leave).
- **Redo line-up** link at the bottom.

- [ ] **Step 1: Failing tests** (`CheckScreen.test.jsx`, identity `H`, plain props):
  - shows `1 of 3 · 0 moved` and the first problem's name; **Accept** calls `onAccept` with that problem.
  - **Fix holds** calls `onFix`; **Skip** calls `onIndexChange(1)`; **Back** disabled at index 0.
  - a moved problem shows `Moved ✓` and **Put back**, no Accept; clicking calls `onPutBack`.
  - `busyId` equal to the shown problem → Accept disabled.
  - all moved → `All moved. The old photo isn't used any more.`
  - holding the photo (`pointerDown`, advance fake timers 300ms) shows `getByLabelText('Old photo')`; `pointerUp` hides it.
  - a not-moved problem with `mask_url` renders an img whose style `transform` starts with `matrix3d(`.
- [ ] **Step 2: Run** `npx vitest run src/move/CheckScreen.test.jsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push** `feat: check screen to accept, fix or put back each problem`.

---

### Task 6: Wire it into Tweaks and the app

**Files:** Modify `board-app/src/App.jsx`, `board-app/src/tweaks/TweaksHub.jsx`, `board-app/src/App.test.jsx` (new `describe('App (move problems)')`; add `uploadMaskFile`, `moveProblem`, `saveAlignments` to the `./lib/board` mock; `vi.mock('./lib/warpImage', () => ({ warpMaskBlob: vi.fn() }))`), `docs/superpowers/specs/2026-08-22-board-problem-tracker-mvp-design.md` (schema block: the two columns).

**Interfaces — Consumes:** everything above.

Behaviour:
- `TweaksHub` new props `moveCount`, `hasMoved`, `onMoveProblems`. Button `⇄ Move problems · {moveCount}` when `moveCount > 0`, `Moved problems` when `moveCount === 0 && hasMoved`, hidden otherwise. Tip copy line under the Board setup buttons, always.
- Views `move-pick`, `move-lineup`, `move-check` join `isTweaksView` (no shared photo, unlock gating) and back to `['tweaks', 'Tweaks']`.
- Opening: `olderPhotos` → if >1 → `move-pick` (list: thumbnail, count, tap picks); if 1 → that photo; if 0 → the newest alignment with `to === board.photo_url`. With a saved alignment for (from, current) → `move-check` at the first unmoved index; else `move-lineup`.
- Line-up save: `H = solveHomography(pairs)`; previous entry (same from/to) gives `prevH` and its `sidesBefore`, else `sidesBefore = sidesOnPhoto(volumes, from)`; `saveAlignments(board.id, upsertAlignment(...))` then, if sides change, `saveVolumes(board.id, moveSides(...))`; update board state; go to `move-check`.
- Accept: `holds = problem.holds.map(h => moveHold(H, h))`; `maskUrl = problem.mask_url ? await uploadMaskFile(id, await warpMaskBlob(problem.mask_url, to, H)) : null`; `moveProblem(id, movedFields(problem, {photoUrl: to, holds, maskUrl}, new Date().toISOString()))`; replace in `problems`; advance to next unmoved. On error: `Could not move that problem — check your connection and try again.`, nothing else changes.
- Put back: `moveProblem(id, putBackFields(problem))`, replace in state.
- Redo line-up (from the check) → `move-lineup` with the saved entry's `pairs` as `initialPairs`.
- Fix: state `fixing = { problemId, photoUrl: to, returnIndex }`; seed the editor with `moveHold`ed holds and `editingId`; `activePhotoUrl` uses `fixing.photoUrl` when set. Editor Back while fixing → clear `fixing`, view `move-check` same index, nothing written. Save while fixing → composite mask as today, `uploadMaskFile` (when `allMasked`), `moveProblem(id, movedFields(problem, {photoUrl: to, holds: cleanHolds, maskUrl}, now))`, clear `fixing`, view `move-check` at the next unmoved. The normal (non-fixing) Edit holds path is unchanged except `uploadProblemMask` now writes unique paths.

- [ ] **Step 1: Failing tests** (board with `photo_url: NEW`, problems on `OLD`, Tweaks signed in as in the volumes tests):
  - Tweaks shows `Move problems · 2` and the tip copy; with every problem on `NEW` and none moved, no move button.
  - with no saved alignment, the button opens the line-up (old-photo step and tip copy visible).
  - with a saved alignment (identity pairs) the button opens the check on the first problem; **Accept** calls `warpMaskBlob(OLD_MASK, NEW, H)`, `uploadMaskFile('p1', blob)`, then `moveProblem('p1', { photo_url: NEW, holds: [...], mask_url: 'u', moved_from: [{ photo_url: OLD, holds: [...], mask_url: OLD_MASK, moved_at: expect.any(String) }] })` and shows `2 of 2`.
  - Accept on a problem with `mask_url: null` → no `warpMaskBlob`, `moveProblem` gets `mask_url: null`.
  - `moveProblem` rejecting → error copy shown, still `1 of 2`, problem still listed as on OLD.
  - **Put back** on a moved problem → `moveProblem` with the restored fields.
  - **Fix holds** opens the editor with `Climbing board` img `src === NEW`; editor Back → back on the check, same problem, `moveProblem` not called.
  - line-up save → `saveAlignments('b1', [expect.objectContaining({ from: OLD, to: NEW, pairs: expect.any(Array) })])`.
- [ ] **Step 2: Run** `npx vitest run src/App.test.jsx -t "App \(move problems\)"` → FAIL.
- [ ] **Step 3: Implement**, and add the two columns to the MVP spec's schema block.
- [ ] **Step 4: Run** `npx vitest run src/App.test.jsx` → all PASS.
- [ ] **Step 5: Full check** `npm test && npm run lint && npm run build` → all pass.
- [ ] **Step 6: Commit + push** `feat: move problems to a new board photo from Tweaks`.
- [ ] **Step 7: Hand over:** dev server with `--host`, give Rob the Network URL, remind him it's live data and to try the re-shoot-the-unchanged-board test first.

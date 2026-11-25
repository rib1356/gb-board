# Warm-up Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An optional notes box when finishing a warm-up, Last sessions showing only the picked climber's warm-ups (with their notes), and Start warm-up moved to the top.

**Architecture:** `warmup_sessions` gains a nullable `notes` column (already run in Supabase). `WarmupRun` holds the notes text and hands it to `onFinish` with the feel; `App` passes it to `createWarmupSession`. `listWarmupSessions` filters by `climbed_by`, and `App` skips the load when nobody is picked.

**Tech Stack:** React + Vite, Vitest + Testing Library, oxlint.

**Spec:** `docs/superpowers/specs/2026-11-25-warmup-notes-design.md`

## Global Constraints

- The column exists already: `alter table warmup_sessions add column notes text;` was run and checked on 2026-11-25. No more SQL.
- Placeholder copy: "Anything worth remembering?". Textarea `aria-label="Warm-up notes"`, 2 rows, never autofocused.
- Notes are trimmed; an empty box saves `null`.
- Tapping Weak / OK / Good stays the only save action. No new buttons.
- Last sessions: still the 10 most recent, now only `climbed_by` = the picked climber. No climber picked: the section is hidden and nothing is fetched.
- Last session rows drop the climber name: `27 Sep · Good · 2/2`.
- Notes line under a row: `#8b8d91`, 13px, wraps.
- Branch `feat/warmup-notes` off `main`. Run commands from `board-app/`.

## Review Focus

1. Switching climber while on the Warm-up screen reloads Last sessions for the new climber, and a slow load for the old climber can't land after it.
2. Keep going, then End again, still shows the typed notes.
3. A notes box with only spaces saves `null`, not `''`.
4. A saved session with notes shows them straight away (from the save result), before any reload.
5. Nobody picked: no Last sessions heading and no `listWarmupSessions` call.

---

### Task 1: Save and show warm-up notes

**Files:**
- Modify: `src/lib/board.js` (`createWarmupSession`, ~line 274)
- Modify: `src/warmup/WarmupRun.jsx`
- Modify: `src/App.jsx` (`handleFinishWarmup`, ~line 776)
- Modify: `src/warmup/WarmupScreen.jsx` (notes line under each session)
- Test: `src/lib/board.test.js`, `src/App.test.jsx`

**Interfaces:**
- Produces: `createWarmupSession(boardId, { doneOn, climbedBy, feel, problemIds, sentIds, notes })`, inserting `notes` as the `notes` column. `WarmupRun`'s `onFinish` receives `{ feel, notes, problemIds, sentIds }` with `notes: string | null`.

- [ ] **Step 0: Branch**

The two specs and two plans were committed to `main` from a temporary worktree, and untracked copies sit in the checkout (on `feat/soft-hard-ungraded`). Check they match `main` (`git diff --no-index` against `git show main:<path>`), then delete them so the switch isn't blocked.

```bash
cd /Users/roblatticetraining/projects/boardClimbing
rm docs/superpowers/specs/2026-11-25-projects-design.md docs/superpowers/specs/2026-11-25-warmup-notes-design.md \
   docs/superpowers/plans/2026-11-25-projects.md docs/superpowers/plans/2026-11-25-warmup-notes.md
git switch main && git pull --ff-only && git switch -c feat/warmup-notes
```

- [ ] **Step 1: Write the failing tests**

`board.test.js`, `createWarmupSession`: extend the existing test so the call passes `notes: 'skin thin'` and the insert expects `notes: 'skin thin'` alongside the other columns.

`App.test.jsx`, `App (warm-up session)`: make the `createWarmupSession` mock row carry `notes: s.notes`, then add:

```js
it('saves typed notes with the feel', async () => {
  const user = await startSession([{ grade: 'V1', problemId: 'p1' }]);
  await user.click(screen.getByRole('button', { name: 'Sent Jug Haul' }));
  await user.type(await screen.findByRole('textbox', { name: 'Warm-up notes' }), '  skin thin  ');
  await user.click(screen.getByRole('button', { name: 'Good' }));
  await waitFor(() => expect(createWarmupSession).toHaveBeenCalledWith('b1', expect.objectContaining({ feel: 'strong', notes: 'skin thin' })));
  expect(await screen.findByText('skin thin')).toBeInTheDocument();
});

it('saves null notes when the box is empty or blank', async () => {
  const user = await startSession([{ grade: 'V1', problemId: 'p1' }]);
  await user.click(screen.getByRole('button', { name: 'End' }));
  await user.type(screen.getByRole('textbox', { name: 'Warm-up notes' }), '   ');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(createWarmupSession).toHaveBeenCalledWith('b1', expect.objectContaining({ notes: null })));
});

it('keeps typed notes through Keep going', async () => {
  const user = await startSession([{ grade: 'V1', problemId: 'p1' }, { grade: 'V2', problemId: 'p2' }]);
  await user.click(screen.getByRole('button', { name: 'End' }));
  await user.type(screen.getByRole('textbox', { name: 'Warm-up notes' }), 'cold board');
  await user.click(screen.getByRole('button', { name: 'Keep going' }));
  await user.click(screen.getByRole('button', { name: 'End' }));
  expect(screen.getByRole('textbox', { name: 'Warm-up notes' })).toHaveValue('cold board');
});

it('does not focus the notes box when the card opens', async () => {
  const user = await startSession([{ grade: 'V1', problemId: 'p1' }]);
  await user.click(screen.getByRole('button', { name: 'End' }));
  expect(screen.getByRole('textbox', { name: 'Warm-up notes' })).not.toHaveFocus();
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/board.test.js src/App.test.jsx -t "warm-up|createWarmupSession"`
Expected: the new tests FAIL (no textbox named "Warm-up notes"; insert lacks `notes`).

- [ ] **Step 3: Implement**

- `board.js`: add `notes` to the destructured argument and to the insert as `notes`.
- `WarmupRun.jsx`: `const [notes, setNotes] = useState('')`; a textarea between the "Warm-up done · …" line and "How did it feel?", styled like the send form's notes box (`inputStyle`-like: dark background, `#3a3b3e` border, 8px radius, `resize: vertical`); `handleFeel` calls `onFinish({ feel, notes: notes.trim() || null, ...sessionPayload(rolled, sentIds) })`. The state lives in `WarmupRun`, so Keep going (which only toggles `finishing`) keeps it.
- `App.jsx` `handleFinishWarmup({ feel, notes, problemIds, sentIds })`: pass `notes` to `createWarmupSession`.
- `WarmupScreen.jsx`: when `s.notes`, render it on its own line under the row text, `#8b8d91`, 13px, `whiteSpace: 'pre-wrap'`. The row `li` becomes a column-friendly layout so the delete button stays at the right of the first line.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/lib/board.js src/lib/board.test.js src/warmup/WarmupRun.jsx src/warmup/WarmupScreen.jsx src/App.jsx src/App.test.jsx
git commit -m "feat: jot notes on how a warm-up went"
git push -u origin feat/warmup-notes
```

---

### Task 2: Your own Last sessions, and Start at the top

**Files:**
- Modify: `src/lib/board.js` (`listWarmupSessions`, ~line 263)
- Modify: `src/App.jsx` (warm-up load effect, ~line 352)
- Modify: `src/warmup/WarmupScreen.jsx`
- Test: `src/lib/board.test.js`, `src/App.test.jsx`

**Interfaces:**
- Consumes: Task 1's session rows with `notes`.
- Produces: `listWarmupSessions(boardId, climberName)`: `.eq('board_id', boardId).eq('climbed_by', climberName)`, newest first, limit 10.

- [ ] **Step 1: Write the failing tests**

`board.test.js`, `listWarmupSessions`: call `listWarmupSessions('b1', 'Rob')`, and additionally expect `c.eq` called with `('climbed_by', 'Rob')`.

`App.test.jsx`, `App (warm-up screen)`, update existing tests:
- "opens from the header and shows the empty state…": replace `expect(listWarmupSessions).toHaveBeenCalledWith('b1')` with `expect(listWarmupSessions).not.toHaveBeenCalled()` (nobody picked).
- "lists fixed, random and removed rungs, plus past sessions": pick Rob (`listClimbers` → `[{ id: 'c1', name: 'Rob' }]`, `localStorage.setItem('board-app:currentClimberId', 'c1')`), expect `listWarmupSessions` called with `('b1', 'Rob')`, and change the row regex to `/27 Sept? · Good · 2\/2/`.

`App (warm-up session)`: in "asks for a feel when the last rung is sent…", change the row regex to `/Good · 1\/1/` and assert the row text does not contain `Rob`.

Add to `App (warm-up screen)`:

```js
it('hides Last sessions when nobody is picked', async () => {
  getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup: [{ grade: 'V1', problemId: 'p1' }] });
  listProblems.mockResolvedValue(PROBLEMS);
  listWarmupSessions.mockResolvedValue([{ id: 's1', done_on: '2026-09-27', climbed_by: 'Rob', feel: 'strong', problem_ids: ['p1'], sent_ids: ['p1'] }]);
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /warm-up/i }));
  await screen.findByRole('button', { name: 'Select who you are first' });
  expect(screen.queryByText('Last sessions')).not.toBeInTheDocument();
  expect(listWarmupSessions).not.toHaveBeenCalled();
});

it('puts Start above the ladder', async () => {
  // same setup as "enables Start when a climber is selected"
  const start = await screen.findByRole('button', { name: 'Start warm-up' });
  const heading = screen.getByText(/Warm-up ladder · 1 rungs?/);
  expect(start.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("reloads Last sessions for the newly picked climber, ignoring the old climber's late result", async () => {
  // Rob and Shawn on the roster, Rob picked. listWarmupSessions('b1','Rob') resolves only
  // after the switch; ('b1','Shawn') resolves at once with a 'Shawn row' session.
  // Open Warm-up, go back, pick Shawn in the climber panel, open Warm-up again,
  // then resolve Rob's call: only Shawn's session shows.
});
```

(The last test: write it with a deferred promise for Rob's call, using the climber panel the same way the existing climber tests do.)

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/board.test.js src/App.test.jsx -t "warm-up|listWarmupSessions"`
Expected: the changed and new tests FAIL.

- [ ] **Step 3: Implement**

- `board.js`: `listWarmupSessions(boardId, climberName)` adds `.eq('climbed_by', climberName)`.
- `App.jsx`: the load effect at ~line 352 runs before `currentClimber` is declared (~line 829), so reading `currentClimber` in its dependency array would throw. Just above the effect, derive `const warmupClimberName = climbers.find((c) => c.id === currentClimberId)?.name ?? null;`. In the effect: when `view !== 'warmup' || !board` return; when `!warmupClimberName`, `setWarmupSessions([])` and return; otherwise load with `listWarmupSessions(board.id, warmupClimberName)` behind a `cancelled` flag set in the cleanup. Dependencies: `[view, board, warmupClimberName]`.
- `WarmupScreen.jsx`: move the Start button above the "Warm-up ladder · N rungs" heading row (full width, `marginBottom` instead of `marginTop`, same labels and disabled state). Render Last sessions only when `climber && sessions.length > 0`. Drop `s.climbed_by` from the row text (keep it in the delete button's aria-label).

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Lint, build and commit**

```bash
npm run lint && npm run build
git add src/lib/board.js src/lib/board.test.js src/warmup/WarmupScreen.jsx src/App.jsx src/App.test.jsx
git commit -m "feat: show only your own warm-ups and put Start at the top"
git push
```

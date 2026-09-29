# Warm-up Ladder — Design

**Date:** 2026-09-29
**Status:** Approved in brainstorming, awaiting spec review

## Goal

A repeatable warm-up for the board: one shared ladder of problems climbed
easiest-to-hardest, mixing hand-picked "benchmark" problems with random
slots that vary session to session. Running the ladder logs sends as normal
and ends with a whole-session feel rating, so over time the history shows
how warm-ups have felt — a benchmark for whether it's a try-hard day.

This is a **warm-up ladder** (one session, climbing up through grades well
below max), not a grade pyramid of sends tracked over weeks.

### Background research (summary)

- No board app (Kilter, Tension, MoonBoard, Stōkt, Crimpd) generates a
  warm-up from your own problems; they offer manual lists/circuits at best.
  Kilter users have noticed the loss of "random at a grade".
- Coaching consensus: 2–5 problems per grade over ~20 min, jugs → pinches/
  slopers → crimps, warm up in the style you'll try hard on, and familiar
  repeats help calibrate. (Climbing.com, Power Company, Hörst, Lattice.)
- Ideas adopted: lock favourites + random fill, recency weighting,
  per-rung re-roll.

## Decisions

| Question | Decision |
|---|---|
| How rungs get problems | Hand-picked fixed rungs **plus** random slots ("random V2") |
| Session tracking | Checklist that logs real ticks, then whole-session feel: Heavy / Normal / Strong |
| Random pool | Sent problems at that grade, weighted least-recently-climbed first |
| Ownership | One shared ladder per board; sessions record who climbed |
| Placement | New Warm-up button in the header, left of New problem |
| Ending early | Still asks for feel and saves the session with partial progress |
| Storage | Ladder as `boards.warmup` jsonb; sessions in a new table |

## Screens

All warm-up screens are new `view` values in `App.jsx` (`'warmup'`,
`'warmup-edit'`, `'warmup-run'`), following the detail view's layout: board
photo on top, cards below, `‹ Board` back button in the header.

### Header (list view)

`New problem` keeps its position and styling as the orange primary button,
far right. A new outlined `Warm-up` button sits to its left. On narrow
screens the Warm-up button collapses to its icon only so the header never
wraps; New problem keeps its label.

### Warm-up screen (`'warmup'`)

- Board photo shows the holds of the selected rung (tap a rung to select;
  first rung selected by default). Random rungs show no holds here.
- Ladder list: position, grade, problem name — or `⟳ random V2` for random
  slots. Fixed rungs whose problem has been deleted show "Problem removed".
- `✎ Edit` button → edit mode.
- `Start warm-up` button. Disabled with the label "Select who you are
  first" when no climber is selected; disabled when the ladder is empty.
- **Last sessions**: latest 10 sessions — `27 Sep · Rob · Strong · 6/6`.
- Empty ladder: "No warm-up yet" + `Build your ladder` → edit mode.

### Edit mode (`'warmup-edit'`)

- Each rung: ↑/↓ nudge buttons, grade, name (or `⟳ random`), `Change`, `✕`.
  Drag-to-reorder is out of scope; ↑/↓ is the reorder mechanism.
- `+ Add a problem` → picker: the problem list sorted Grade ↑ (reusing
  `sortAndFilterProblems`) with a name search box. Tapping a problem adds a
  fixed rung.
- `+ Add random slot` → grade chips (V0–V18). Adds a random rung.
- `Change` opens the same picker for that rung; the picker also offers
  "Make this a random slot" at the rung's current grade.
- Rungs are not forced into grade order.
- `Done` saves the whole array via `saveWarmup` and returns to the Warm-up
  screen. Save failure shows the standard error banner and stays in edit mode.

### Running a session (`'warmup-run'`)

- On start, `rollLadder` fills the random slots. The header shows
  no back button (so a stray tap can't drop a session); the panel shows
  `<climber> · <sent>/<total>` and an `End` button.
- Photo shows the current rung's holds.
- Rungs show ✓ (sent), ▶ (current), ○ (to do). Random picks show `⟳`;
  tapping it re-rolls that rung only (excluding its current pick and every
  other problem in the ladder). Re-roll is disabled with "only one V2" when
  nothing else qualifies. Pool-fallback picks are labelled "not sent yet".
- `Sent ✓` on the current rung calls the existing `createTick` with the
  selected climber, updates `send_count` locally exactly as the detail
  view's Log a send does, then advances to the next unsent rung.
- Tapping any rung makes it current (skipping is allowed).
- Skipped rungs ("No V2s on the board", "Problem removed") are shown greyed
  and never become current.
- When every climbable rung is sent, or on `End`, the feel prompt
  appears: "Warm-up done · 4 / 6 — How did it feel? [Heavy] [Normal]
  [Strong]". Choosing one saves the session and returns to the Warm-up
  screen. The prompt also has "Discard" (no session saved; ticks already
  logged stay).
- If the app is closed mid-session nothing about the session persists;
  ticks already logged are kept. No session resume.

## Random-pick logic

Pure module `src/lib/warmup.js`:

```js
rollLadder(rungs, problems, { rng, today })
  // -> [{ rung, problem | null, random: bool, status }]
  // status: 'ok' | 'unsent-fallback' | 'no-problems' | 'removed'
rerollRung(rolled, index, problems, { rng, today })
  // -> new rolled array with that rung re-picked, or unchanged if no alternative
canReroll(rolled, index, problems) // -> bool
```

- `rungs`: `[{ grade: 'V2', problemId: 'uuid' | null }]` (null = random).
- `problems`: the loaded (non-deleted) problem list.
- `last_sent_on` on each problem (the database already maintains it alongside
  `send_count`) is the last-climbed date — no extra query.

Rules:

1. Fixed rungs resolve first: the problem by id, or `status: 'removed'` if
   it's not in `problems`.
2. Random rungs resolve top to bottom. The pool is problems with exactly the
   rung's grade, excluding every problem already in the ladder (all fixed
   rungs and earlier random picks).
3. Prefer `send_count > 0`. If none, fall back to unsent problems at that
   grade (`status: 'unsent-fallback'`). If none at all,
   `status: 'no-problems'`, `problem: null`.
4. Weighted pick: `weight = min(daysSinceLastClimbed, 60) + 1`, measured
   from today. A problem with no tick date gets the maximum weight (61).
5. Re-roll uses the same pool and weights, with the current pick
   additionally excluded.

## Data

### SQL (the user runs this in the Supabase SQL editor)

```sql
alter table boards add column warmup jsonb not null default '[]';

create table warmup_sessions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade,
  done_on date not null default current_date,
  climbed_by text,
  feel text check (feel in ('heavy','normal','strong')),
  problem_ids uuid[] not null,
  sent_ids uuid[] not null,
  created_at timestamptz default now()
);
```

RLS stays disabled, matching every other table. `problem_ids` holds the
rungs in order as climbed (random picks resolved; skipped rungs omitted);
`sent_ids` is the subset ticked during the session. The board's existing
`select('*')` load returns `warmup` with no extra request.

### `src/lib/board.js` additions

- `saveWarmup(boardId, rungs)` — `update({ warmup: rungs })` on `boards`,
  returns the updated board.
- `listWarmupSessions(boardId)` — latest 10, newest first.
- `createWarmupSession(boardId, { climbedBy, feel, problemIds, sentIds })`.

Deleting a problem doesn't touch `boards.warmup`; resolution handles it at
read time (rule 1).

## Error handling

Follows the existing pattern: failed Supabase calls log to the console and
set the error banner with a "check your connection and try again" message.
A failed tick during a session leaves the rung unsent. A failed session save
keeps the feel prompt open so it can be retried.

## Testing

- `src/lib/warmup.test.js` (TDD, seeded `rng`): fixed resolution, removed
  problems, no duplicates across random slots, sent-first with unsent
  fallback, no-problems status, recency weighting (older picked with a
  low rng value, cap at 60), re-roll excludes current pick, `canReroll`.
- `src/lib/board.test.js`: the four new functions against the mocked client.
- `src/App.test.jsx`: header button opens the Warm-up screen; build a ladder
  (add fixed + random, reorder, save called with the right array); run a
  session (Sent ✓ calls `createTick` and advances; re-roll; End part-way →
  feel → `createWarmupSession` with partial `sentIds`); Start disabled with
  no climber.

## Out of scope

Multiple ladders, per-problem feel ratings, charts of feel over time,
rest timers, drag-to-reorder, resuming an interrupted session, hold-type
tagging and style ordering.

## Follow-up (separate change)

Restore the problem list's scroll position when returning from a problem's
detail view.

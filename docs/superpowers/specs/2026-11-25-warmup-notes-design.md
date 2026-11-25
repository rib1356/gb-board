# Warm-up Notes, Your Own Last Sessions, and Start at the Top — Design

**Date:** 2026-11-25
**Status:** Agreed in brainstorming, awaiting Rob's review
**Builds on:** [Warm-up Ladder](2026-09-29-warmup-ladder-design.md)
**Size:** a small change

## Why

The Weak / OK / Good buttons at the end of a warm-up are good, but they can't
say *why* it felt that way ("skin thin", "cold board", "tweaky ring finger").
Rob wants a quick box to jot that down. Two smaller fixes come with it:
Last sessions shows everyone's warm-ups when it should show only your own, and
**Start warm-up** sits below the ladder when it's the thing you came to tap.

## Goals

1. An optional notes box on the "Warm-up done" card. Saving stays one tap:
   tapping Weak, OK or Good saves the feel and the notes together.
2. Notes show under their session in Last sessions.
3. Last sessions shows only the warm-ups of whoever is picked as climbing.
4. **Start warm-up** moves to directly under the board photo, above the
   "Warm-up ladder · N rungs" heading.

## Non-goals

- No editing notes after the warm-up is saved.
- No notes per rung or per problem.
- No change to the feel buttons, the ladder, or how a run works.

## Anti-goals

- The box must never be required, and must never add a tap to finishing a
  warm-up. Skipping it should be exactly as fast as today.

## Approaches

There is one sensible way: a nullable `notes` column on `warmup_sessions`. A
separate table or browser storage would add work and lose the notes on a new
phone, for nothing in return.

## Design

**Data.** Rob runs this in the Supabase SQL editor before the change ships:

```sql
alter table warmup_sessions add column notes text;
```

(The table already has RLS disabled and its grants; adding a column keeps
both.)

**Finish card** (`WarmupRun.jsx`):

```
Warm-up done · 6 / 6
┌───────────────────────────────┐
│ Anything worth remembering?   │   ← textarea, 2 rows, optional
└───────────────────────────────┘
How did it feel?
[ Weak ]  [  OK  ]  [ Good ]
Keep going   Discard
```

- The box sits between the "Warm-up done" line and "How did it feel?".
- Do not autofocus it: the keyboard should stay down until Rob taps the box
  (same reason as the check-in sheet fix in `6909264`).
- Tapping a feel button saves `{ feel, notes, ... }`. Notes are trimmed;
  empty becomes `null`.
- **Keep going** hides the card but keeps what was typed, so ending again
  shows it.

**Last sessions** (`WarmupScreen.jsx`, `listWarmupSessions` in `board.js`):

- Load with `.eq('climbed_by', climberName)` as well as the board, still the
  10 most recent. Reload when the picked climber changes.
- No climber picked: hide Last sessions (Start is already disabled with
  "Select who you are first").
- A session with notes shows them on a second line under its row, muted
  (`#8b8d91`, 13px), wrapping as needed. Sessions without notes look as now.
- Since every row is now your own, drop the climber name from the row text.

**Start warm-up** moves above the ladder heading, full width, with the same
enabled/disabled states and labels as now:

```
[ board photo ]
[ Start warm-up ]
Warm-up ladder · 6 rungs            Edit
 1  V2  …
Last sessions
 Tue 24 Nov · Good · 6/6
   skin thin, felt greasy
```

## Left to the builder

- Exact spacing and the textarea's styling (follow the send form's notes
  box).
- Whether the climber filter happens in the query or in the component, as long
  as Last sessions still shows up to 10 of *your* sessions.

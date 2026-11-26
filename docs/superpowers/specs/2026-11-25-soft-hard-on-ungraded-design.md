# Soft and Hard Votes on Ungraded Problems — Design

**Date:** 2026-11-25
**Status:** Approved by Rob
**Builds on:** [Provisional Grades from Votes](2026-11-23-provisional-grades-design.md)
(reverses its "no soft or hard votes on ungraded problems" non-goal)

## Why

On an ungraded problem the grade dropdown only takes a whole grade. Someone
doing the first send can say "V5" but not "hard V5", which they can on a
graded problem's chips. Rob wants that from the first send.

## Goals

- After picking a grade in the dropdown, a climber can mark it soft or hard.
- Works on the send form and in Your vote, as the dropdown does now.

## Non-goals

- No change to the provisional grade. Soft and hard only sort votes within a
  grade, so the middle vote's grade is the same either way; "V5?" stays a
  whole grade.
- No database change. Votes already store `feel`.

## Anti-goals

- **Logging a send gets slower.** The chips start on plain, so picking just a
  grade is still one step.

## Approaches

1. **Three chips under the dropdown (chosen).** Once a grade is picked,
   "soft V5 / V5 / hard V5" chips appear below it, in the existing chip style.
2. **One big dropdown** with soft, plain and hard of every grade: 57 entries,
   hard to scroll on a phone.
3. **The five-chip row around the picked grade:** the neighbouring grades
   repeat what the dropdown already does.

## Design

- With `anyGrade` and a grade picked, `VotePicker` shows a row of three chips
  for that grade: soft, plain, hard. The picked one matches `feel`.
- Tapping soft or hard reports `{ grade, feel, stars }`. Tapping the picked
  soft or hard again goes back to plain (`feel: null`). Plain can't be unpicked
  by tapping; "No vote" in the dropdown clears the grade.
- Changing the grade in the dropdown resets `feel` to null, as now.
- "No vote" hides the chips.
- The "Grade votes" line already prints "hard V5" and needs no change.
- When a real grade is later set, these votes line up with the normal chips.

## Calls Claude made

- The chip row is a group named "Grade feel", so it doesn't clash with the
  graded problem's "Grade vote" chip group.
- No label on the chip row; it sits under the Grade dropdown.

## Testing

- `VotePicker.test.jsx`: chips hidden with no grade; shown with one; soft and
  hard report the feel and keep the stars; tapping the picked feel goes back
  to plain; changing grade still resets feel; disabled ignores taps.
- `App.test.jsx`: on an ungraded problem's send form, picking V5 then hard saves
  `{ grade: 'V5', feel: 'hard' }`.
- `npm run lint`, `npm test` and `npm run build` pass. Rob checks on his phone.

## Delivery

Branch `feat/soft-hard-ungraded` off `main`, then a PR. No SQL.

# Provisional Grades from Votes — Design

**Date:** 2026-11-23
**Status:** Agreed in brainstorming, awaiting Rob's review
**Builds on:** [Grade & Star Votes](2026-10-22-votes-and-heatmap-design.md)

## Why

Some problems go up with no grade, so the crew can decide what grade they are.
Right now nobody can vote on the grade of an ungraded problem: the vote
chips are built around the problem's grade, so with no grade the Grade row is
hidden and only stars can be voted on. The problem then shows "–" everywhere
until someone remembers to set a grade by hand.

This change lets people vote on the grade of an ungraded problem. Until
someone sets a grade by hand, the problem shows the middle vote as a
**provisional grade**. That grade counts everywhere a grade counts.

## Goals

- When you log your first send of an ungraded problem, you can vote on its
  grade as well as its stars. Anyone with a send logged can vote or change
  their vote from the problem page, as for graded problems.
- An ungraded problem with grade votes shows a provisional grade, worked out
  from the votes and updated as they come in.
- The provisional grade counts everywhere: list sorting, logbook, progress,
  the trophy screen and the warm-up ladder.
- Setting a grade by hand replaces it.

## Non-goals

- Votes never change a grade set by hand. That rule from the votes spec stays.
- No soft or hard votes on ungraded problems. Soft and hard are for nudging a
  grade the crew already agrees on.
- No minimum number of votes before a provisional grade shows.
- No database change.

## Anti-goals

- **A provisional grade looks like a real one.** It must always look
  different: grey with a "?", never the orange badge.
- **A provisional grade gets saved as the real grade without anyone choosing
  it.** Editing an ungraded problem (to rename it, say) must leave it
  ungraded.
- **Logging a send gets slower.** The grade vote stays optional and starts
  unpicked.

## Approaches

The grade is read in about eight places (list badge and sort, problem page,
logbook, progress, trophy screen, warm-up ladder). We considered three ways to
make them all use the provisional grade:

1. **Shown-grade field (chosen).** When problems and votes load, work out
   each problem's grade once and store it next to the problem as `shownGrade`,
   with a flag for whether it's provisional. Every place that reads a grade
   switches to `shownGrade`. The real `grade` is left alone, so the edit form
   and the vote chips can't mix the two up.
2. **Swap the grade in memory.** Overwrite `problem.grade` with the
   provisional one. Few edits, but the edit form copies `grade` into its
   fields, so renaming a "V5?" problem would quietly save V5 as its real
   grade. Rejected because of the anti-goal above.
3. **Pass votes into every function.** Same result as 1, but every stats and
   list function signature and test changes, and the same sum runs in eight
   places.

A Supabase column kept up to date by a trigger was ruled out. It needs SQL
for a sum the app can already do from data it has loaded.

## Decisions

| Question | Decision |
|---|---|
| What the votes do on an ungraded problem | They set a provisional grade until someone sets a grade by hand (Rob) |
| Where the provisional grade counts | Everywhere a grade counts (Rob) |
| How it's wired in | A `shownGrade` field worked out once when the data loads (Rob) |

## The calls Claude made

Rob didn't specify these, so they're worth checking:

- **Ungraded** means what it means for the vote chips today:
  `gradeNumber(problem.grade)` is null.
- **The provisional grade is the median** of the problem's counted grade
  votes (the same "counted" rule as now: the voter has a named send). If the
  votes split evenly between two grades, it takes the easier one (the lower
  middle vote). A vote's soft or hard is ignored here, and only its grade is
  used. That only matters for votes cast before a problem was set back to
  ungraded.
- **It shows from the first vote.**
- **The voting control on an ungraded problem** is a dropdown in the
  Grade row: "No vote", then V0–V18. It's used on the send form and in Your
  vote. Picking a grade saves `{ grade, feel: null }`, and "No vote" clears
  just the grade. Graded problems keep their five chips. The control depends
  on the **real** grade, so a problem showing "V5?" still gets the dropdown,
  not chips around V5.
- **How it looks:** wherever a problem's grade is printed next to the
  problem, it reads "V5?" in grey (`#8b8d91`) instead of orange. The badges in
  the list and on the problem page also get a dashed border. That covers the
  problem list, the problem page, logbook rows, Most climbed, the trophy screen
  lists and the warm-up screens.
- **Places that print a grade on its own**, not next to a problem, show no
  "?". These are the ticklist rows, the hardest-send tile, the weekly grade
  chart and the crew board's top grade. They describe the climber, not the
  problem.
- **The edit form:** when the problem has no real grade but has a provisional
  one, a small grey hint under the grade dropdown reads "Votes say V5". The
  dropdown still starts on "No grade", so saving without touching it keeps the
  problem ungraded.
- **The warm-up ladder:** provisional problems join the random pool for their
  grade, and can be picked as fixed rungs. A fixed rung stores its grade when
  you add it, as it does now.
- **The "Grade votes" line** on the problem page already works for ungraded
  problems, and stays as it is.

## Shape of the change

- `src/lib/votes.js` gets pure helpers:
  - `provisionalGrade(problemId, counted)` returns `'V5'` or `null`.
  - `withShownGrades(problems, counted)` returns each problem with
    `shownGrade` (the real grade if it's a V-grade, else the provisional grade,
    else the stored grade as it is) and `gradeProvisional` (true when
    `shownGrade` came from votes).
  - A label helper returns "V5?" or "V5".
- `App.jsx` builds the decorated problems once with `useMemo` from `problems`
  and `counted`, and passes them to everything that reads grades.
- Grade readers switch from `grade` to `shownGrade`:
  - `problemList` sorting
  - `boardStats` (`summary`, `crewBoard` top, `openProjects` order)
  - `progress` (`hardestOf`, `ticklist`, `mostClimbed`)
  - `sends.buildLogbook`, which carries `shownGrade` and the flag into its day
    rows
  - `warmup` pools
  - `WarmupEditor`'s pickable list
- Vote chips (`gradeChoices`) and the edit form keep reading the real `grade`.
- `VotePicker` gets the dropdown form of its Grade row for ungraded problems.
- Saving votes (`saveVote`, the first-send flow, Your vote) is unchanged.

## Testing

- `votes.test.js`:
  - the median with odd and even counts, where an even split takes the easier
    grade;
  - votes that don't count are ignored, and soft and hard are ignored;
  - a real grade always wins over votes;
  - no votes means no provisional grade.
- The lib tests for sorting, board stats, progress, logbook and warm-up each
  get a case where a provisional problem counts at its provisional grade.
- `App.test.jsx`:
  - the first-send form on an ungraded problem shows the grade dropdown;
  - picking a grade saves the vote;
  - the list and the problem page show "V5?";
  - the edit form shows "Votes say V5", and saving it leaves the problem
    ungraded;
  - a graded problem still shows chips.
- By eye: in the iOS Simulator at 360px and 390px, against live data.
- `npm run lint`, `npm test` and `npm run build` pass.

## Delivery

Branch `feat/provisional-grades` off `main`. Rob tests on his phone over the
LAN, then a PR to `main`. No SQL to run.

## Left to the builder

- The exact dropdown styling, matching the app's existing selects.
- The name of the label helper, and whether the shown fields are spread onto
  the problem object or kept beside it.

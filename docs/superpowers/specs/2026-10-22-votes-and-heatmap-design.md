# Grade & Star Votes, and the Hold Heatmap — Design

**Date:** 2026-10-22
**Status:** Agreed in brainstorming, awaiting Rob's review

## Why

**Votes.** When a grade feels off, the crew talks it over and someone moves
the grade by hand. That works, but the reasons are lost and nobody can see
whether one person or five thought it was soft. Stars are worse: whoever
taps them last sets them for everyone. This change lets everyone who has sent
a problem say what grade they think it is and how many stars it deserves. The
stars become the average of those votes. The grade stays hand-set, with the
votes shown beside it as information.

**Heatmap.** When setting, the question is "which holds has nobody used
yet?" The trophy screen gets a picture of the board with a glow over every
hold that problems use. A hold with no glow is free to set on.

The two features don't depend on each other and ship as separate PRs.

## Goals

- When you log your first send of a problem, you can vote on its grade and
  stars in one tap each, without slowing the send down.
- Anyone who already has a send logged can vote or change their vote from the
  problem page, so sends from before this change can still vote.
- A problem's stars are the average of the votes.
- Grade votes sit next to the grade and never look like the grade.
- Anyone on the crew can see from the trophy screen which holds are unused.

## Non-goals

- Votes never change a problem's grade. People still change it by hand, as
  they do now.
- Nobody sets a problem's stars directly anymore, not even the setter.
- People who haven't sent a problem can't vote on it.
- The heatmap has no grade filter, and tapping a hold doesn't list the
  problems that use it.
- No mapping of every hold on the board. The app only knows the holds that
  problems have marked.

## Anti-goals

These would count as failures even if everything technically worked:

- **Votes look like the grade.** If someone can glance at a problem and
  mistake "V4 ×1 · V5 ×3" for its grade, the feature has failed.
- **Logging a send gets slower.** Both votes are optional and start
  unpicked. You can still log a send in the same taps as now.
- **Stars go blank overnight.** 41 of the 48 problems have stars today. They
  must keep showing them until real votes come in.
- **The glow hides free holds.** The point is to see bare holds, so the glows
  must not cover their neighbours or darken the photo so much that bare holds
  are hard to pick out.

## The calls Claude made

Rob didn't specify these, so they're worth checking:

- The table is called `votes`. One row per climber per problem holds both
  their grade vote and their star vote.
- A vote only counts while the voter still has a send of that problem
  logged. If they delete their only send, the vote stops counting. It comes
  back if they log it again.
- Grade votes are offered as five chips: one grade easier, soft, the
  current grade, hard, and one grade harder (on a V5: V4 · soft V5 · V5 ·
  hard V5 · V6). Neighbouring grades get no soft or hard. If your saved vote
  is outside those five (because the problem has since been regraded), it
  shows as an extra chip so you can see it and change it. *(Changed
  2026-10-22 after Rob tried it: see the end of the spec.)*
- Ungraded problems (2 today) get a star vote only. Set a grade by hand
  first to open grade voting.
- Grade votes read as "Grade votes: soft V5 ×1 · V5 ×2 · hard V5 ×3" in
  small grey body text, never in the mono orange grade style.
- The stars show the average rounded to the nearest half star. The problem
  page also shows the exact average and the number of votes ("4.3 · 5
  votes").
- Classics on the trophy screen shows "★ 4.3", a gold star and the average,
  in place of a row of stars.
- The heatmap is the last section on the trophy screen, because it's tall
  and the lists above it are what people check most.
- **No separate full-size heatmap view.** Earlier we talked about tapping the
  heatmap to open it big. The board photo is portrait (1400 × 1734), so in
  the card it's already as big as it is on a problem page, and pinch-zoom
  works in Safari. Add the bigger view later if the card feels too small.
- Volume sides count as holds on the heatmap. Each side is one spot,
  grouped by which side it is rather than by distance.

## Decisions

| Question | Decision |
|---|---|
| What changes the grade | People, by hand, as now. Votes sit beside it |
| What sets the stars | The average of the star votes. Nobody sets them directly |
| When you're asked | On the send form, only for your first send of that problem (the same rule as "Flashed it") |
| Sends logged before this change | Anyone with a send logged can vote or change their vote from the problem page |
| Who can vote | Only climbers with a named send of that problem |
| What a grade vote stores | An actual grade ("V5"), plus "soft" or "hard" when picked, so it still makes sense after a regrade |
| Existing star ratings | A problem keeps its current `rating` until its first star vote. From then on, it shows the average of the votes |
| Heatmap audience | Everyone, on the trophy (board stats) screen |
| What the heatmap shows | A glow over every hold that live problems on the current photo use, warmer the more problems use it. Bare holds are the unused ones |
| Foot holds on the heatmap | Ignored. A hold only ever used as a foot shows bare |
| Heatmap data | Worked out from problems' saved holds. **No schema change** for the heatmap |

## Part 1: Grade and star votes

### Data

One new table. Rob runs this in the Supabase SQL editor before testing the
branch locally. Running it early is harmless, because nothing reads the
table until the PR is merged.

```sql
create table votes (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references problems(id) on delete cascade,
  climber text not null,                 -- name snapshot, like ticks.sent_by
  grade text check (grade ~ '^V([0-9]|1[0-8])$'),
  stars smallint check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  unique (problem_id, climber),
  check (grade is not null or stars is not null)
);
alter table votes disable row level security;
grant select, insert, update, delete on public.votes to anon, authenticated, service_role;
```

- `climber` is the climber's name, as text, for the same reason
  `ticks.sent_by` is: names are snapshots (see the climber profiles spec).
- `grade` and `stars` are each optional, but a row always has at least one.
  When both are cleared, the app deletes the row.
- The grade check matches `GRADES` in `src/lib/grades.js` (V0–V18).
- Added 2026-10-22: a `feel` column, `soft` / `hard` / null, which only goes
  with a grade:

  ```sql
  alter table votes add column feel text check (feel in ('soft', 'hard'));
  alter table votes add constraint votes_feel_needs_grade check (feel is null or grade is not null);
  ```
- `problems.rating` stays as it is. The app stops writing it and only reads
  it as the fallback described below. Nothing is dropped.

### `src/lib/board.js`

- `listBoardVotes(boardId)` loads every vote on the board's problems, in
  pages, the same way `listBoardTicks` does: ordered by `created_at, id`, with
  `problems!inner(board_id)`, and reading pages until one comes back empty
  (the project's row cap may be under 1,000). It selects `id, problem_id,
  climber, grade, feel, stars, created_at`.
- `saveVote(problemId, climber, { grade, feel, stars })`:
  - If either is set, it upserts on `(problem_id, climber)` and returns the
    row.
  - If both are `null`, it deletes the row and returns `null`.
- `rateProblem` and its test are removed.

### Which votes count

A vote counts while its climber has at least one named send (`sent_by`
equal to the climber) of that problem in the board's sends. Sends with no
name, logged before climber profiles, don't count as anyone's send, so they
don't unlock a vote. This is worked out each time from loaded data, like
flashes are, and never stored.

### What a problem shows

- **Stars**:
  - With one or more counted star votes: the average of those votes.
  - With none: `problems.rating` if it's set. This is the old rating.
  - Otherwise: no stars.
- **Grade votes**: each grade with at least one counted vote, and how many
  votes it got, easiest first.

### Pure module `src/lib/votes.js`

No React or Supabase. Each function takes plain arrays, so tests can build
them by hand.

- `countedVotes(votes, ticks)` returns the votes whose climber has a named
  send of that problem.
- `starSummary(problem, counted)` returns `{ average, count, stars }` when
  there are star votes, with `stars` rounded to the nearest 0.5. It returns
  `{ average: rating, count: 0, stars: rating, legacy: true }` when the
  problem only has an old `rating`. Otherwise it returns `null`.
- `gradeVoteCounts(counted)` returns `[{ grade, feel, count }]` for one
  problem, easiest first (soft V5 before V5 before hard V5). Ungraded or
  unparseable values are left out.
- `gradeChoices(currentGrade, myVote)` returns the chips to show, each a
  `{ grade, feel }`: the grade below, soft, the current grade, hard, and the
  grade above, clamped to V0–V18, plus `myVote` if it isn't one of those,
  easiest first. For an ungraded problem it returns `[]`.
- A grade vote reads "soft V5", "V5" or "hard V5" everywhere it's shown.
- `voteFor(votes, problemId, climber)` returns that climber's vote row, or
  `null`.

### The send form (first send only)

Under "Flashed it", shown on exactly the same condition (the climber has no
send of this problem yet):

- **Grade:** the `gradeChoices` chips. None is picked to start with. Tapping
  a chip picks it, and tapping it again unpicks it. This row is hidden for an
  ungraded problem.
- **Stars:** five tappable stars, none picked to start with. Tapping the
  picked star again clears it, as on the problem page today.

On **Save entry**, the send is created first, exactly as now. If a grade or
stars were picked, `saveVote` runs next. It only overwrites what was picked:
someone who deleted their only send and is logging it again may still have a
saved vote, and picking stars alone must not wipe their grade vote. A grade
and its soft/hard always travel together: picking plain V5 replaces an old
"hard V4" with V5, never "hard V5". If the send saves but the vote
doesn't, the form still closes, and the app shows: "Your send is logged, but
your vote didn't save. You can add it from the problem page."

### The problem page

- **Stars row:** the tappable `StarRating` becomes read-only and shows
  `starSummary.stars`, drawn with half stars. After it comes
  "4.3 · 5 votes" in muted grey ("1 vote" when there's one). An old rating
  shows its stars with no text. The "Sent ×N" text stays where it is.
- **Grade votes line:** under the stars row, in 13px muted grey body text
  (Inter, `#8b8d91`): "Grade votes: soft V5 ×1 · V5 ×2 · hard V5 ×3". It's hidden when there
  are none. It never uses the mono font or the orange grade colour.
- **Your vote:** shown only when the picked climber has a named send of this
  problem. It's a small block under the grade votes line with the same Grade
  chips and Stars row as the send form, pre-filled with the climber's saved
  vote. Each tap saves straight away through `saveVote`, as tapping stars does
  today. While a save is in flight, the chips and stars are disabled. On
  failure the app
  shows: "Could not save your vote — check your connection and try again."
  The block is hidden when nobody is picked, and when the picked climber
  hasn't sent the problem.

### The problem list

Each row's stars come from `starSummary` (half stars, no count), so the list
matches the problem page.

### Trophy screen: Classics

- The ranking uses `starSummary.average`, unrounded, in place of
  `problem.rating`. Old ratings count until a problem has votes. Ties still
  go to ascents, then name.
- Each row shows "★ 4.3" in gold, with the average always to one decimal
  place ("★ 4.0" for an even 4). An old whole-number rating shows as "★ 4".
- `classics` in `boardStats.js` takes the votes as an extra argument.

### App state

- `boardVotes` is loaded with `listBoardVotes` alongside `boardTicks` when
  the board loads, and reloaded with it in `refreshList` (pull-to-refresh and
  coming back to the app). If it fails, the load fails with the existing
  "Could not load the board" message, as a failed `boardTicks` page does.
- Grades are parsed with `gradeNumber`. Any old free-text grade that isn't a
  V-grade counts as ungraded, so it gets no grade chips.
- Saving a vote updates `boardVotes` in place, replacing the climber's row
  or removing it.
- Logging and deleting sends already update `boardTicks`, so a vote starts
  or stops counting straight away, without a reload.
- `handleRate` goes.

## Part 2: The hold heatmap

### Where

The last section on the trophy screen (`BoardStatsScreen`), titled
**Heatmap**, with the note "no glow = free to set on" on the right. It uses the
same `Section` card as the other sections.

It is hidden when the board has no photo, or when no live problem was set on
the current photo.

### What it draws

- The current board photo at the card's full width, with its corners
  rounded like the other photos.
- A soft glow over each **spot**. A spot is one hold or one volume side that
  at least one problem uses.
  - **Heat** is the number of different problems that use the spot. Start,
    hand and finish holds all count the same.
  - **Foot holds are ignored** (`type: 'foot'`), including volume sides
    marked as feet. A hold that has only ever been a foot shows bare, because
    it's still free to set on as a handhold. This was Rob's call.
  - The glow gets warmer and stronger as heat rises. The busiest spot on the
    board gets the strongest glow.
  - The glow is about the size of a hold, so it doesn't spill onto the holds
    around it.
- A legend under the photo: a small ramp from "1 problem" to "{max}
  problems", and the line "No glow: never used as a handhold".
- No interaction. Pinch-zoom in the browser is enough.

### Which problems count

Live problems (as loaded) whose `photo_url` is the current board photo
(`photoStatus(problem, board) === 'current'`). Problems marked on older
photos or before photo tracking are left out, because their points don't line
up with this photo. Today, all 48 live problems are on the current photo.

### Grouping marks into spots

Two problems that use the same hold mark it a few pixels apart. Live data
shows marks of the same hold usually sit within 0.3–0.7% of the photo width
of each other, while different holds are much further apart.

- **Holds (no `face`):** greedy grouping. Go through problems oldest first,
  and each problem's holds in order. Each mark joins the nearest existing spot
  within the merge radius, or starts a new spot. A spot's position is the
  average of its marks. The merge radius starts at **2% of the photo's
  width**. Distances are measured in real proportions: `y` is scaled by the
  photo's height/width ratio, so a vertical gap isn't treated as smaller than
  the same horizontal gap. Tune the radius by eye against live data.
- **Volume sides (`face` set):** grouped by `volumeId` + `faceId`, not by
  distance. They're drawn at the average of the `x, y` the problems stored
  for that side.
- A problem that marks two points inside one spot counts once towards that
  spot's heat.

### Pure module `src/lib/heatmap.js`

- `heatSpots(problems, photoUrl, aspect, radius = MERGE_RADIUS)` returns
  `[{ x, y, heat, face }]`, where `aspect` is the photo's height/width. It
  leaves out problems on other photos.
- `MERGE_RADIUS` is exported, so the screen and the tests use the same value.

The screen reads the photo's natural size once it loads, to get `aspect`.
Until then it draws the photo without glows.

## Error handling

- Votes: covered above, for the board load, the send form and the problem
  page. A failed vote save never loses a send.
- Heatmap: nothing is fetched. If the photo fails to load, the section shows
  the existing broken-photo behaviour, with no glows.

## Testing

- **`votes.test.js`:**
  - a vote stops counting when its climber's only send is deleted, and
    counts again when they log it again;
  - an unnamed send doesn't unlock a vote;
  - star averages and rounding to the nearest half (4.25 → 4.5, 4.2 → 4);
  - the old rating is used only while there are no star votes, and a grade-only
    vote doesn't replace it;
  - grade counts come out easiest first;
  - `gradeChoices` at V0, at V18, for an ungraded problem, and with a saved
    vote outside the five chips.
- **`heatmap.test.js`:**
  - marks within the radius merge, and marks outside it don't;
  - the aspect ratio scales vertical distance;
  - two points from one problem in one spot count once;
  - volume sides group by id, not distance;
  - foot holds are left out, including a volume side marked as a foot, so a
    foot-only hold makes no spot;
  - problems on another photo are left out;
  - the order is stable, so the same input always gives the same spots.
- **`board.test.js`:**
  - `listBoardVotes` pages until an empty page;
  - `saveVote` upserts on `(problem_id, climber)` and deletes when both
    values are cleared.
- **`boardStats.test.js`:** classics ranks by average, and falls back to the
  old rating.
- **`App.test.jsx`:**
  - the first-send form shows the Grade and Stars rows, with nothing picked;
  - a repeat send's form shows neither;
  - saving with picks creates the send, then the vote;
  - a failed vote still logs the send and shows the message;
  - the problem page shows "Grade votes" and the average with its count;
  - Your vote shows only for a climber who has sent it, and its taps save;
  - the stars on the problem page are no longer tappable;
  - the Heatmap section shows on the trophy screen.
- **By eye:**
  - against live data, in the iOS Simulator at 360px and 390px;
  - the send form doesn't overflow;
  - the grade votes line can't be mistaken for the grade;
  - half stars render in the list;
  - glows sit on the holds, bare holds are easy to spot, and the merge radius
    joins repeat marks without joining neighbouring holds.
- `npm run lint`, `npm test` and `npm run build` pass.

## Delivery

Two branches off `main`, each with its own PR, and each tested by Rob on his
phone over the LAN before merging:

1. `feat/votes`. Before testing, Rob runs the SQL above. Votes cast while
   testing locally are real, because the dev server uses live data.
2. `feat/heatmap`. No SQL.

Both branches edit `BoardStatsScreen.jsx` and the props `App.jsx` passes to
it, so whichever merges second will need a small conflict fixed.

## Left to the builder

- The exact glow rendering (canvas or SVG), its colour ramp and the glow
  size. Load the `dataviz` skill before choosing the ramp. Glows must read on
  a busy photo and must not hide bare holds.
- How half stars are drawn.
- The exact spacing and sizes of the chips and the Your vote block, in the
  app's existing styles.
- The final merge radius, tuned against live data.

## Out of scope

- Votes moving the grade, or a nudge to regrade.
- Votes in the logbook, the progress charts or the ticklist.
- A grade filter or tap-to-list on the heatmap.
- A full-size heatmap view.
- Mapping every hold on the board.
- Flash grade vs send grade.

## Changes after trying it (2026-10-22)

- **Soft and hard grade votes.** Whole-grade chips couldn't say "hard V5":
  the jump from V5 to V6 is big enough that a stiff V5 almost never earns a
  V6 vote. The grade row now offers V4 · soft V5 · V5 · hard V5 · V6, in the
  words the crew already uses. A vote stores its grade plus `feel` (`soft` /
  `hard` / null), so "hard V5" still means hard V5 after a regrade. The chips
  sit on their own line under the "Grade" label, so five fit on a narrow
  phone. Rob's two test votes from before the change keep `feel` empty.

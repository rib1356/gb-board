# Logbook Progress & Board Stats — Design

**Date:** 2026-10-21
**Status:** Approved in brainstorming, awaiting spec review

## Goal

The board is fixed for a year from 21 Oct 2026, so every send from here on is
on the same holds. That makes progress numbers compare like with like. This
change adds two kinds of analytics, both worked out from sends the app already
loads:

1. **Your progress**, in the logbook: a Progress tab next to the session list,
   with your hardest send, how often you climb and how much you get through,
   week by week across the board year.
2. **The board's stats**, behind a new trophy button: a monthly crew board,
   first ascents (FAs), classics, what's popular, open projects and what's
   gathering dust.

It also fixes session rows that wrap onto two lines on phones.

Mockups agreed during brainstorming are in
`.superpowers/brainstorm/35382-1792583571/content/` (`logbook-full.html`,
`board-stats-v3.html`), which git ignores.

## Decisions

| Question | Decision |
|---|---|
| Where personal progress lives | A **Sessions \| Progress** tab switch at the top of the logbook |
| Hardest send on each session row | Left off. It's on the Progress line instead |
| Session rows wrapping on phones | Always one line: the year moves to month headings ("October 2026"), dates read "Thu 8 Oct", and flashes show as the gold bolt plus a count |
| Time charts | Grouped **by week** (Mon–Sun) and drawn on one shared set of week columns, so they line up |
| How far back | From your first session, up to the **last 52 weeks**, rolling after that. No range switch for now |
| Sessions scale | 0–2 sessions a week, growing only if a week has more |
| "Hardest send" | Counts repeats: how hard you climbed that week, not only new ticks |
| Charts | Hand-drawn SVG, no chart library |
| Where board stats live | A new screen behind a trophy button, next to the logbook button |
| Fitting the trophy button | The climber pill shows just the name ("Rob", not "You: Rob") and the two icon buttons get slimmer. This was measured at 18px spare on a 360px phone |
| Crew board | This calendar month: Problems · New · Flashes · Top, sorted by New |
| FA | The first named send. If a problem's first send was logged before climber names existed, it has no FA |
| Repeats and ascents | Count different climbers, not laps |
| Calculations | Done in the app from loaded data. **No schema change, no SQL** |

## Data

No new tables or columns. Everything comes from `problems` (already loaded
with `select('*')`) and the board's sends from `listBoardTicks`, which already
returns `id, problem_id, sent_by, sent_on, created_at, flash`.

### `listBoardTicks` loads in pages

Supabase returns at most 1,000 rows per request by default, and the board is on
track to pass 1,000 sends within the year. After that, this feature and the
existing Unsent filter would quietly use partial data. `listBoardTicks` will
request `range(from, from + 999)` in a loop, ordered by `created_at, id` so pages
are stable, until a page comes back with fewer than 1,000 rows.

### Shared rules

- **Live problems only.** Sends on deleted problems are ignored everywhere, as
  the logbook does today.
- **Named sends** (`sent_by` set) are the only ones credited to a climber.
  Sends with no name, logged before climber profiles, still count as the
  problem having been sent, for open projects and least climbed lately.
- **Grades** are parsed with the existing `gradeNumber`. Ungraded problems are
  left out of anything that ranks or plots a grade.
- **New tick** = a climber's first send of a problem, using the existing
  `firstSendIds`. **Flash** = a first send marked as a flash (existing rule).
- **Session** = a day a climber sent at least one live problem. A problem
  logged twice in a day counts once (existing `buildLogbook` rule).
- **Dates** are `YYYY-MM-DD` strings and are compared as dates, never times,
  so week and month boundaries don't move with daylight saving. "Today" is the
  phone's local date.

## Screens

### Problem list: the controls row

- The climber pill shows the name alone ("Rob"), or "Who's climbing?" when
  nobody is picked. Long names are cut off with an ellipsis so they can't
  wrap the row.
- The logbook (calendar) button and a new **trophy** button (lucide `Trophy`,
  `aria-label="Board stats"`) sit side by side with `padding: 5px 8px` and a
  6px gap.
- It must stay on one line at 360px and up. Check this in the iOS Simulator.

### Logbook: Sessions tab

Unchanged apart from the rows:

- Before the first session of each month, a heading in the `sectionHeading`
  style: "October 2026". It's a label, not a row you can tap.
- The date drops the year: "Tue 20 Oct".
- The summary reads "20 problems · 4 new", followed by a gold `Zap` icon and
  the count when there were flashes. The words "flash" and "flashes" are gone
  from rows.
- The row never wraps. The `flexWrap` that let the counts drop under the date
  is removed.

### Logbook: Progress tab

Top to bottom:

1. **Three headline tiles**
   - **Hardest send:** your hardest graded send ever, or "–" if none.
   - **Sessions a week, last 4 weeks:** sessions with `sent_on` in the last
     28 days ÷ 4, to one decimal place.
   - **Problems ticked:** different live problems you've sent / live problems
     on the board, shown as "34/48".
2. **Week readout:** one line for the picked week, e.g. "Week of 12 Oct · 2
   sessions · top V5 · 34 problems", where "34 problems" is the problems sent
   that week (new plus repeats). It shows the latest week until you pick
   another.
3. **One panel of four charts on shared week columns**
   - **Hardest send each week:** a 2px line in the accent colour, with grade
     gridlines at V0/V2/V4/…. Weeks with no graded send have no point, and the
     line joins across them. Dots (r 4, with a 2px surface ring) are shown
     while there are 20 weeks or fewer. After that, only the latest week and
     the picked week get dots.
   - **Sessions each week:** bars from 0 to max(2, most sessions in a week).
   - **Problems each week:** stacked bars, with new ticks (accent) at the
     bottom, a 2px surface gap, then repeats (grey `#76787d`, which clears 3:1
     against the card). It has a legend, since there are two series.
   - **Problems ticked so far:** your running total of different problems
     sent, with a reference line at the live problem count ("of 48 on the
     board").
   - Bars are at most 16px wide and narrow as weeks are added. Month labels
     sit under the bar charts and are skipped when they'd collide.
   - **Picking a week:** tapping anywhere on the panel picks the nearest
     week, and dragging moves through the weeks. The picked week gets a faint
     band across all four charts, and the readout updates. Keyboard: the panel
     is focusable, and the left and right arrow keys step through weeks.
4. **Board ticklist:** a row for each grade that has problems on the board,
   easiest first, with a track sized to that grade's problem count, filled
   for how many you've ticked, and a "7/9" label. Ungraded problems are left
   out.
5. **Your most-climbed:** your top 5 problems by how many sessions you've sent
   each one, with ties going to the most recent. Each row shows grade, name
   and "×12", and opens the problem.

Empty state: if nobody is picked, show the existing "Select who you are"
prompt. If the climber has no sends, show "Log a send to start your
progress".

The chosen tab is kept while you open a problem and come back, like the open
days are now.

### Board stats (new view `'stats'`)

Title "Board stats", with the subtitle "48 problems · 5 climbers". It works
whether or not a climber is picked. Every problem row opens that problem, and
Back returns here ("‹ Stats") at the same scroll position.

1. **{Month} crew board** ("resets 1 Nov" on the right)
   - A table with the columns Climber · Problems · New · Flashes · Top. It
     includes everyone with a named send this calendar month.
   - **Problems:** problems sent this month, each counted once per day, so
     the same problem on two days counts twice.
   - **New:** their first sends that happened this month.
   - **Flashes:** their flashed first sends this month.
   - **Top:** their hardest graded send this month.
   - Sorted by New, then Problems, then name. The leader in each column is
     bold, and ties are all bold.
   - Empty state: "No sends yet in November", plus "Last month: Shawn ticked
     the most new problems (20)" if last month had any.
2. **Latest FAs** ("first to send")
   - The 5 most recent FAs: grade, name, "Rob · 20 Oct".
   - A **Most FAs** tally underneath: every climber with an FA, most first.
3. **Classics** ("best rated, then most ascents")
   - Rated problems, sorted by stars, then ascents (different climbers), then
     name. Top 5.
   - Each row shows grade, name, stars and "4 ascents".
4. **Popular lately** ("last 30 days")
   - Problems sorted by how many different climbers sent them in the last 30
     days, then by sends, then by the latest send. Top 5.
   - Each row shows "3 climbers". The section is hidden if nothing was sent
     in that window.
5. **No FA yet** ("9 open projects")
   - **Every** live problem with no sends at all, hardest first, ungraded last,
     then oldest first.
   - Each row shows grade, name, "set by Shawn" and "open 34 days", counted
     from `created_at`: "set today" / "open 1 day" / "open N days".
   - The section is hidden if there are none.
6. **Least climbed lately** ("longest since a send")
   - Problems that have been sent, sorted by oldest latest send, worked out
     from the sends themselves. Top 5.
   - Each row shows "8 days ago" / "yesterday" / "today".

### Problem page: the FA line

Under "Set by …", with a small gold trophy icon:

- **FA exists:** "FA Rob · 20 Oct". (A repeats count was dropped after
  launch: the send list below already shows who has sent it.)
- **Never sent:** "No FA yet · up for grabs".
- **First send was logged before climber names:** no line.

### Navigation

- `view` gains `'stats'`.
- `backTo` gains `'stats'`, with the back label "Stats".
- `returnScrollRef` covers `'stats'` the way it covers `'list'` and
  `'logbook'`.
- The logbook's selected tab lives in App state next to `openLogbookDays`.

## Pure modules

All the numbers come from pure functions with no React or Supabase, tested on
their own. Each takes `problems`, `ticks` and a `today` date string, so tests
can pin the date.

### `src/lib/progress.js` (one climber)

- `weeklyProgress(problems, ticks, climber, today)` → `[{ weekStart, sessions,
  top, newTicks, repeats, ticked }]`. This runs from the week of the first
  session to the current week, capped to the last 52. `top` is `null` for
  weeks with no graded send, and `ticked` is the running total.
- `progressTiles(problems, ticks, climber, today)` → `{ hardest,
  sessionsPerWeek, ticked, total }`.
- `ticklist(problems, ticks, climber)` → `[{ grade, ticked, total }]`.
- `mostClimbed(problems, ticks, climber, limit = 5)` → `[{ id, name, grade,
  sessions }]`.
Date helpers (`localDate`, `addDays`, `daysBetween`, `weekStartOf`,
`monthOf`, `previousMonth`, `nextMonth`, `monthName`) live in
`src/lib/dates.js` and are shared by both modules.

### `src/lib/boardStats.js` (whole board)

- `crewBoard(problems, ticks, month)` → rows as above. `month` is `YYYY-MM`.
- `firstAscents(problems, ticks)` → `Map(problemId → { climber, date,
  loggedAt } | null)`.
- `latestFAs(problems, ticks, limit = 5)` and `faTally(problems, ticks)`.
- `classics(problems, ticks, limit = 5)`.
- `popularLately(problems, ticks, today, limit = 5)`.
- `openProjects(problems, ticks, today)`: all of them.
- `leastClimbedLately(problems, ticks, today, limit = 5)`.

## Components

- `src/logbook/LogbookScreen.jsx`: adds the tab switch and month headings,
  and the new row summary.
- `src/logbook/ProgressTab.jsx`: tiles, readout, ticklist and most-climbed.
- `src/logbook/WeekCharts.jsx`: the four-chart panel, which owns the picked
  week, nearest-week tapping, dragging and arrow keys.
- `src/stats/BoardStatsScreen.jsx`: the board stats sections.
- `App.jsx`: the trophy button, the climber pill text, the `'stats'` view and
  back navigation, and the FA line on the problem page.

Chart colours reuse the app's tokens: accent `#D9552B` for marks, gridlines
`#34353a`, picked-week band `#2d2e32`, and labels in the existing muted grey
`#8b8d91`. Text never takes the series colour.

## Error handling

- Nothing new is fetched apart from the extra pages of sends. If any page
  fails, the load fails with the existing "Could not load the board" message,
  so there's never a half-loaded set.
- Logging or deleting a send already updates `boardTicks` in place, so the
  stats and charts update without a reload.
- Every calculation copes with empty input, and the screens show the empty
  states above instead of empty charts.

## Testing

- **`progress.test.js`:**
  - weeks across a month end and a year end;
  - the 52-week cut-off;
  - a week with only ungraded sends, which has no `top`;
  - new ticks vs repeats, including a problem logged twice in one day;
  - sends on deleted problems are ignored;
  - sessions per week over 28 days;
  - ticklist totals;
  - most-climbed counts sessions, not sends, with ties going to the most
    recent.
- **`boardStats.test.js`:**
  - the crew board only counts the given month;
  - leaders and ties;
  - an FA whose first send has no name gives no FA, and nobody else is
    credited;
  - classics ordering;
  - popular lately's 30-day window;
  - open projects ordering and "open N days";
  - an anonymous send stops a problem being an open project;
  - least climbed lately ordering.
- **`board.test.js`:** `listBoardTicks` keeps paging until a short page, and
  pages are ordered.
- **`App.test.jsx`:**
  - the trophy button opens Board stats;
  - a stats row opens its problem and Back returns to Stats;
  - the logbook tabs switch, and the tab is kept after viewing a problem;
  - month headings appear;
  - the FA line and "up for grabs" show on the problem page;
  - the climber pill shows the name alone.
- **By eye:**
  - run the app against live data and check the Progress tab and Board stats
    at 360px and 390px in the iOS Simulator;
  - the controls row and session rows don't wrap;
  - week picking works by tap and drag;
  - charts match the mockups.
- `npm run lint`, `npm test` and `npm run build` pass.

## Out of scope

- A 3 months / 6 months / Year range switch. We'll add it later if the year
  view feels cramped.
- A "You got the FA!" moment when logging the first send of an open project.
- Star ratings per climber (today each problem has one rating).
- Flash grade vs send grade.
- Warm-up feel compared against how the session went. There aren't enough
  warm-ups logged yet.

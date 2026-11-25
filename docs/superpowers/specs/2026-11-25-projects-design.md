# Your Projects — Design

**Date:** 2026-11-25
**Status:** Agreed in brainstorming, awaiting Rob's review
**Size:** a project

## Why

The app only records sends. A "session" in the logbook is just a day you sent
something, so the days you spent falling off a project leave no trace. Rob
wants to keep track of what he's working on, see how it's going, and once it
goes, know how many sessions it took.

It only works if logging is close to free. Rob was clear: if it adds friction,
he won't do it. So a project session is **one tap**, with no form, no date
picker and no "where did you get to".

## Goals

1. On a problem page, one tap on **Worked it today** logs today as a session
   on that problem, for whoever is picked as climbing.
2. Your projects (problems you've worked and not yet sent) sit in a
   **Your projects** section at the top of the main list, with how many
   sessions and when you were last on it.
3. Projects you stop trying **go cold on their own**: no session for 4 weeks
   moves a project into a collapsed **Gone cold** section. Working it again
   brings it back.
4. When you send a project, it leaves the list, and the send shows how many
   sessions it took: on the problem page and in your logbook.
5. Every climber can use it, but everything is per climber: you only ever see
   your own projects and session counts, for whoever is picked on that phone.
6. In Tweaks, a day Rob worked a project counts as a **board day**, the same as
   a day he sent something. Most such days already count, because Rob warms up
   and logs sends in the same session, so this only catches the odd day with
   no sends.

## Non-goals

- No high point, "where I got to", attempt counts or notes per session.
  Considered and dropped as friction.
- No adding sessions from before this ships, and no picking a date. A session
  is always today.
- No Drop button or manual project list. Projects come from taps and leave by
  sending or going cold.
- Nothing shown to the rest of the crew: no project stats on the trophy screen,
  no "Rob is projecting this" on a problem.
- No Wrapped or year-end stats yet. The data should make them possible later.

## Anti-goals

- Anything that adds a tap or a field to logging a session.
- Anything that describes *how* to climb a problem (see the no-prescribed-beta
  rule: the app records what a problem is and who climbed it, not the beta).
- Project sessions leaking into send counts: logbook sessions, progress, crew
  board, FAs, flashes, heatmap and warm-ups must not change. (Tweaks board days
  are the one deliberate exception, goal 6.)

## Approaches

| Approach | Trade-off |
|---|---|
| **A. New `project_sessions` table (chosen)** | One new table to create. Nothing that already reads `ticks` changes, so no send count can be inflated by mistake. Same pattern as `votes` and `warmup_sessions`. |
| B. Tries as flagged rows in `ticks` | No new table, but every query and helper that counts sends would need to skip tries, and missing one quietly corrupts stats. |
| C. Browser storage only | No database change, but lost on a new phone or cleared Safari data, and unusable for Wrapped later. |

Rob picked A.

## Data

Rob runs this in the Supabase SQL editor before the change ships:

```sql
create table project_sessions (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references problems(id) on delete cascade,
  climber text not null,                 -- name snapshot, like ticks.sent_by and votes.climber
  worked_on date not null,               -- the climber's local date when they tapped
  created_at timestamptz not null default now(),
  unique (problem_id, climber, worked_on)
);
alter table project_sessions disable row level security;
grant select, insert, update, delete on public.project_sessions to anon, authenticated, service_role;
```

The unique key makes a second tap on the same day a no-op at the database, not
just in the UI. A plain insert errors on it, so the add should upsert with
duplicates ignored. Add the table to the schema section of the MVP spec, as with
earlier tables.

## Definitions

All derived, nothing else stored. "You" is the picked climber; "your send" is
a `ticks` row with `sent_by` equal to your name.

- **Today**: `todayISO()` in `lib/warmup.js`, the same date the send form and
  warm-up sends default to. *(Builder-check call.)* That date is UTC, so it's a
  day behind between midnight and 1am in summer, and `localDate()` in
  `lib/dates.js` would be more correct. But sessions-to-send compares
  `worked_on` with `sent_on`, so they must come from the same clock. Moving
  sends and sessions to `localDate()` together is a separate fix.
- **Your first send** of a problem: the earliest of your sends by `sent_on`,
  ties broken by `created_at` (as `firstSendIds` in `lib/sends.js` does).
- **A project**: a live (not soft-deleted) problem with at least one of your
  `project_sessions` rows and no send by you.
- **Sessions so far** on a project: the number of your rows for it.
- **Last worked**: the latest `worked_on` among them.
- **Gone cold**: last worked is 28 or more days before today. Anything more
  recent is active. There is no stored state: working it again makes it active.
- **Sessions to send** (for a problem you've sent): the number of distinct
  dates among your `worked_on` dates on or before your first send's `sent_on`,
  plus that `sent_on` date if it isn't already among them. Rows dated after the
  first send are ignored (they can only exist if a send was backdated).
  Only shown if you have at least one row on or before the first send; a
  problem you sent without ever tapping shows nothing.

## Behaviour

### Problem page

The button sits in the same row as **Log a send**, to its left:

```
[ Worked it today ]  [ + Log a send ]
```

- Shown only when a climber is picked **and** they haven't sent this problem.
  With nobody picked, the existing "Select who you are to log a send" prompt
  covers both.
- Not yet worked today: **Worked it today**. One tap saves a row for today.
- Already worked today: **Worked today ✓** (highlighted). One tap deletes
  today's row, as an undo.
- The button flips straight away and saves in the background. If the save
  fails, it flips back and the usual error banner says so ("Could not save
  that — check your connection and try again." in the app's existing style).
  A tap while a save is still going is ignored.
- Under the button row, while it's a project: `3 sessions · since 12 Nov`
  (count, then the date of the first session). Nothing on a problem you've
  never worked.
- Once you've sent it, the button goes. Your first send in the sends list
  gets a tag: **5 sessions**, or **First session** when the count is 1. The tag
  appears only on your own send, never on another climber's.

### Main list: Your projects

Shown only when a climber is picked and they have at least one project. It
sits between the sort / Unsent / climber row and the problem list, and it
ignores the sort and the Unsent filter.

```
YOUR PROJECTS
 Hyperbole                          V7
 3 sessions · last Tue 24 Nov
 Crimp Lord                         V6
 5 sessions · last Sat 21 Nov
 › Gone cold (2)
```

- Active projects, most recently worked first.
- Each row: name, grade (with the provisional style, as the main list does),
  then `N sessions · last <Ddd D Mon>`. Tapping a row opens the problem, and
  Back returns to the list, as tapping a problem in the main list does.
- **Gone cold (N)** is a collapsed row under the active ones. Tapping it shows
  the cold projects in the same row style, most recently worked first. It
  starts collapsed when the app loads, and keeps its open/closed state across
  a trip to a problem and Back, so the main list's saved scroll position still
  lines up (as the logbook keeps open days in App state). *(Builder-check
  call.)* If every project has gone cold, only the Gone cold row shows under
  the heading.
- Projects still appear in the main list below as normal. This section is a
  shortcut, not a filter.
- The heading says **Your projects**, not "Projects", because the trophy
  screen already uses "open projects" for problems with no first ascent yet.

### Logbook

In an expanded day of the Sessions tab, a problem row for your first send of
a project gets the same tag as the problem page (**5 sessions** /
**First session**), next to the existing New and Flash badges. Day summary
rows don't change.

### Loading

- Load the whole board's `project_sessions` (join on `problems.board_id`,
  paged like `listBoardTicks` and `listBoardVotes`), with the board's other
  data and on pull-to-refresh, and keep them in App state beside
  `boardTicks`. *(My call, after goal 6.)* Tweaks needs Rob's sessions whoever
  is picked, and one board-wide load is simpler than two per-climber ones.
  The per-climber rule is applied in the UI: every view filters to the picked
  climber's name, and with nobody picked nothing project-related shows.
- Problem, send and logbook views use these rows plus the `boardTicks` already
  loaded. No extra fetch per problem.
- Adding or undoing a session updates this state as well as the database.
- Deleting your only send makes the problem a project again, because it's all
  derived.

### Tweaks board days

`boardDays(boardTicks, BOARD_OWNER)` in `lib/injuries.js` (used at
`App.jsx` for `robsBoardDays`) returns the dates Rob sent something. It
becomes the union of those dates and the `worked_on` dates of Rob's
`project_sessions`. Both uses follow automatically: the board-day dots on the
pain chart, and the "board" activity pre-ticked on a new check-in
(`newCheckinDraft` in `lib/checkins.js`). Add tests for a session-only day, a
day with both, and another climber's session not counting.

## Code shape (suggested)

- `lib/projects.js`: pure functions, unit-tested like the other `lib/` files,
  for example `yourProjects(problems, sessions, ticks, climber, today)` →
  `{ active, cold }`, `sessionsToSend(sessions, ticks, problemId, climber)`,
  `workedToday(...)`.
- `lib/board.js`: `listBoardProjectSessions(boardId)`,
  `addProjectSession(problemId, climber, workedOn)`,
  `removeProjectSession(problemId, climber, workedOn)`.
- UI in `App.jsx` (problem page, main list) and `logbook/LogbookScreen.jsx`.
  A small component for the Your projects section would keep `App.jsx` from
  growing further.

## Testing

- Unit tests for the definitions above, including: same-day double tap, undo,
  the 28-day cold boundary, send on the same day as a session, send with no
  sessions, a backdated send before later sessions, a deleted send, a
  soft-deleted problem, and two climbers working the same problem.
- Rob tests on his phone over the LAN dev server before it merges, against the
  live Supabase data.

## Left to the builder

- Exact styling of the button states, the session tag and the Your projects
  rows, within the app's existing look.
- Whether optimistic updates reuse an existing pattern or get a small helper.
- How the code splits across components.

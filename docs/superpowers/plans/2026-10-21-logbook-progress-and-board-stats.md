# Logbook Progress & Board Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Progress tab to the logbook (weekly charts, headline numbers, ticklist, most-climbed), one-line session rows with month headings, and a Board stats screen behind a trophy button (crew board, FAs, classics, popular lately, open projects, least climbed lately), plus an FA line on each problem page.

**Architecture:** Every number is worked out in the browser by pure functions in `src/lib/` (`dates.js`, `progress.js`, `boardStats.js`) from the problems and board sends the app already loads. Screens are React components in `src/logbook/` and `src/stats/`, and the charts are hand-drawn SVG. The only data-layer change is that `listBoardTicks` reads sends in pages, so it can't be cut off at Supabase's 1,000-row cap.

**Tech Stack:** React 19, Vite 8, Vitest 4 + Testing Library (jsdom), lucide-react icons, Supabase JS v2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-logbook-progress-and-board-stats-design.md`

## Global Constraints

- **No new npm dependencies. No schema changes and no SQL.** Everything comes from `problems` and `listBoardTicks`.
- **Branches:**
  - Part 1 is built on `feat/logbook-progress` (from `main`) and goes in as PR 1 into `main`.
  - Part 2 is built on `feat/board-stats` (from `feat/logbook-progress`) and goes in as PR 2 with base `feat/logbook-progress`. GitHub retargets it to `main` once PR 1 merges.
- **Never commit to `main` directly.** Push every commit to its branch straight away. Rob wants commits pushed automatically.
- **Commit messages:** conventional (`feat:`, `fix:`, `test:`, `docs:`), each ending with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Where commands run:** `/Users/roblatticetraining/projects/boardClimbing/board-app`. Single test file: `npx vitest run <path>`. Everything: `npm test`, `npm run lint`, `npm run build`.
- **Dates:**
  - `YYYY-MM-DD` strings, with arithmetic on UTC midnights.
  - "Today" is the phone's local date (`localDate()`).
  - Weeks run Monday to Sunday. Time charts cover the climber's first session up to the last **52** weeks.
- **Colours:**

  | Use | Colour |
  |---|---|
  | Accent | `#D9552B` |
  | Repeats | `#76787d` |
  | Gridlines | `#34353a` |
  | Picked-week band | `#2d2e32` |
  | Muted text | `#8b8d91` |
  | Flash/trophy gold | `#C9A227` |
  | Card | `#232427` |
  | Card border | `#2A2B2E` |

  Text never takes a series colour.
- **Copy, exactly:**
  - "Sessions" / "Progress"
  - "Hardest send", "Sessions a week, last 4 weeks", "Problems ticked"
  - "Hardest send each week", "Sessions each week", "Problems each week", "Problems ticked so far"
  - "Board ticklist", "Your most-climbed"
  - "Log a send to start your progress"
  - "Board stats"
  - "{Month} crew board", "Latest FAs", "Most FAs", "Classics", "Popular lately", "No FA yet", "Least climbed lately"
  - "No FA yet · up for grabs"
  - "FA {name} · {d Mon} · {n repeats}"
  - "No sends yet in {Month}"
  - "Last month: {name} ticked the most new problems ({n})"
- **Controls row:** above the problem list, it must stay on one line at **360px** wide and up.
- **Session rows:** never wrap. The year lives in month headings ("October 2026").

## Review Focus

1. **A send dated in the future** (the date picker allows it). Rob expects the charts not to grow extra future weeks, and the "last 4 weeks" rate to ignore it. Tested in Task 3.
2. **Sends older than 52 weeks** must still count towards "Problems ticked so far" and "Hardest send", even though their weeks have scrolled off the chart. Tested in Task 3.
3. **Picking a week you didn't climb** should read "Week of 14 Sept · no sessions", not a blank or a crash. Tested in Task 6.
4. **A board with only one week of data** (a new climber's first week) should draw one column cleanly, with no NaN geometry. Tested in Task 5.
5. **A problem set just after midnight** should count its "open N days" from the phone's own date, not UTC's, so it doesn't read a day out. Also, a problem with no `created_at` mustn't print "open NaN days". Tested in Task 8.

---

# Part 1: Logbook progress (PR 1)

### Task 1: Branch and date helpers

**Files:**
- Create: `board-app/src/lib/dates.js`
- Test: `board-app/src/lib/dates.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `localDate(at?: Date): string`: the phone's calendar date `YYYY-MM-DD`.
  - `addDays(date: string, days: number): string`
  - `daysBetween(from: string, to: string): number`: whole days, `to − from`.
  - `weekStartOf(date: string): string`: the Monday of that week.
  - `monthOf(date: string): string`: `YYYY-MM`.
  - `previousMonth(month: string): string` and `nextMonth(month: string): string`
  - `monthName(month: string): string`: e.g. `'November'`.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/roblatticetraining/projects/boardClimbing
git checkout main && git pull --ff-only
git checkout -b feat/logbook-progress
```

- [ ] **Step 2: Write the failing test** at `board-app/src/lib/dates.test.js`

```js
import { describe, it, expect } from 'vitest';
import { localDate, addDays, daysBetween, weekStartOf, monthOf, previousMonth, nextMonth, monthName } from './dates';

describe('localDate', () => {
  it("uses the phone's calendar date, not UTC's", () => {
    expect(localDate(new Date(2026, 9, 21, 0, 30))).toBe('2026-10-21');
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('addDays and daysBetween', () => {
  it('count calendar days across a month end, a year end and the clocks going back', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-10-21', -28)).toBe('2026-09-23');
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-12-25', '2027-01-01')).toBe(7);
  });
});

describe('weekStartOf', () => {
  it('finds the Monday of the week, the Monday itself included', () => {
    expect(weekStartOf('2026-10-21')).toBe('2026-10-19'); // Wednesday
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19'); // Monday
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28'); // across the year end
  });
});

describe('months', () => {
  it('steps back and forward, across a year end too', () => {
    expect(monthOf('2026-10-21')).toBe('2026-10');
    expect(previousMonth('2026-11')).toBe('2026-10');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });

  it('names a month', () => {
    expect(monthName('2026-11')).toBe('November');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/dates.test.js`
Expected: FAIL, because `./dates` can't be resolved.

- [ ] **Step 4: Write the implementation** at `board-app/src/lib/dates.js`

```js
// Dates here are YYYY-MM-DD strings, the way sends store sent_on. Arithmetic
// is done on UTC midnights, so a week or month boundary never moves when the
// clocks change.
const DAY_MS = 24 * 60 * 60 * 1000;
const toMs = (date) => Date.parse(`${date}T00:00:00Z`);
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);

// The phone's own calendar date -- not toISOString(), which is a day out
// between midnight and 1am in summer.
export function localDate(at = new Date()) {
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

export function addDays(date, days) {
  return fromMs(toMs(date) + days * DAY_MS);
}

export function daysBetween(from, to) {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

// Weeks run Monday to Sunday.
export function weekStartOf(date) {
  const ms = toMs(date);
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
  return fromMs(ms - sinceMonday * DAY_MS);
}

export function monthOf(date) {
  return date.slice(0, 7);
}

function shiftMonth(month, by) {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export const previousMonth = (month) => shiftMonth(month, -1);
export const nextMonth = (month) => shiftMonth(month, 1);

export function monthName(month) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/dates.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit and push**

```bash
git add src/lib/dates.js src/lib/dates.test.js
git commit -m "$(printf 'feat: add date helpers for weeks and months\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
git push -u origin feat/logbook-progress
```

---

### Task 2: Load the board's sends in pages

**Files:**
- Modify: `board-app/src/lib/board.js` (the `listBoardTicks` function)
- Test: `board-app/src/lib/board.test.js` (the `chain` helper, and the `listBoardTicks` describe block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `listBoardTicks(boardId): Promise<Tick[]>`. Same shape as now, just never cut off. Each tick has `id, problem_id, sent_by, sent_on, created_at, flash`.

- [ ] **Step 1: Add `range` to the test's chain helper.** In `board-app/src/lib/board.test.js`, inside `function chain(result)`, add one line after `limit: vi.fn(() => builder),`:

```js
    range: vi.fn(() => builder),
```

- [ ] **Step 2: Replace the `listBoardTicks` describe block** in `board-app/src/lib/board.test.js` with:

```js
describe('listBoardTicks', () => {
  const tick = (n) => ({ id: `t${n}`, problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-01T10:00:00Z' });

  it("lists every send on the board's problems, through the problem each one is on", async () => {
    const rows = [tick(1)];
    const first = chain({ data: rows, error: null });
    mocks.supabase.from.mockReturnValueOnce(first).mockReturnValueOnce(chain({ data: [], error: null }));
    const result = await listBoardTicks('b1');
    expect(result).toEqual(rows);
    expect(mocks.supabase.from).toHaveBeenCalledWith('ticks');
    expect(first.select).toHaveBeenCalledWith('id, problem_id, sent_by, sent_on, created_at, flash, problems!inner(board_id)');
    expect(first.eq).toHaveBeenCalledWith('problems.board_id', 'b1');
    expect(first.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(first.order).toHaveBeenCalledWith('id', { ascending: true });
    expect(first.range).toHaveBeenCalledWith(0, 999);
  });

  it('keeps reading pages until one comes back empty, so nothing past 1,000 sends is lost', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => tick(i));
    const page2 = [tick(1000), tick(1001), tick(1002)];
    const second = chain({ data: page2, error: null });
    const third = chain({ data: [], error: null });
    mocks.supabase.from
      .mockReturnValueOnce(chain({ data: page1, error: null }))
      .mockReturnValueOnce(second)
      .mockReturnValueOnce(third);
    const result = await listBoardTicks('b1');
    expect(result).toHaveLength(1003);
    expect(second.range).toHaveBeenCalledWith(1000, 1999);
    expect(third.range).toHaveBeenCalledWith(1003, 2002);
  });

  it('throws when the query fails', async () => {
    mocks.supabase.from.mockReturnValue(chain({ data: null, error: new Error('nope') }));
    await expect(listBoardTicks('b1')).rejects.toThrow('nope');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/board.test.js -t listBoardTicks`
Expected: FAIL. `first.order` isn't called with `'created_at'`, and the paging test gets 1000 rows back instead of 1003.

- [ ] **Step 4: Replace `listBoardTicks`** in `board-app/src/lib/board.js`. Keep the comment above it:

```js
// Just enough of every send on the board to know who has sent what, without
// fetching each problem's log. Supabase hands back at most 1,000 rows a
// request (or whatever the project's cap is), so this reads a page at a time
// until one comes back empty -- ordered, so a send can't slip between pages.
const TICK_PAGE = 1000;

export async function listBoardTicks(boardId) {
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('ticks')
      .select('id, problem_id, sent_by, sent_on, created_at, flash, problems!inner(board_id)')
      .eq('problems.board_id', boardId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(all.length, all.length + TICK_PAGE - 1);
    if (error) throw error;
    if (data.length === 0) return all;
    all.push(...data);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/board.test.js`
Expected: PASS (every test in the file).

- [ ] **Step 6: Commit and push**

```bash
git add src/lib/board.js src/lib/board.test.js
git commit -m "$(printf "fix: read the board's sends in pages so none are lost past 1,000\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")"
git push
```

---

### Task 3: Progress calculations

**Files:**
- Create: `board-app/src/lib/progress.js`
- Test: `board-app/src/lib/progress.test.js`
- Modify: `docs/superpowers/specs/2026-10-21-logbook-progress-and-board-stats-design.md` (sync two details, Step 5)

**Interfaces:**
- Consumes:
  - `buildLogbook(problems, ticks, climberName)` from `./sends`. It returns `[{ date, problems: [{ id, name, grade, firstSend, flashed }] }]`, newest day first. A day is a session, a problem appears once per day, and sends on problems not in `problems` are dropped.
  - `gradeNumber(grade): number | null` from `./problemList`.
  - `addDays` and `weekStartOf` from `./dates`.
- Produces:
  - `MAX_WEEKS = 52`
  - `weeklyProgress(problems, ticks, climberName, today)` → `Week[]`, where `Week = { weekStart: string, sessions: number, top: number | null, newTicks: number, repeats: number, ticked: number }`, oldest first.
  - `progressTiles(problems, ticks, climberName, today)` → `{ hardest: number | null, sessionsPerWeek: number, ticked: number, total: number }`.
  - `ticklist(problems, ticks, climberName)` → `[{ grade: number, ticked: number, total: number }]`, ascending, with only grades that have problems.
  - `mostClimbed(problems, ticks, climberName, limit = 5)` → `[{ id, name, grade, sessions }]`.

- [ ] **Step 1: Write the failing test** at `board-app/src/lib/progress.test.js`

```js
import { describe, it, expect } from 'vitest';
import { weeklyProgress, progressTiles, ticklist, mostClimbed, MAX_WEEKS } from './progress';

const PROBLEMS = [
  { id: 'p1', name: 'Gaston Traverse', grade: 'V5' },
  { id: 'p2', name: 'Crimpy Corner', grade: 'V3' },
  { id: 'p3', name: 'Jug Haul', grade: 'V2' },
  { id: 'p4', name: 'Mystery', grade: '' },
];
const tick = (id, problemId, sentOn, sentBy = 'Rob', createdAt = `${sentOn}T18:00:00Z`) => ({
  id, problem_id: problemId, sent_by: sentBy, sent_on: sentOn, created_at: createdAt, flash: false,
});

describe('weeklyProgress', () => {
  it("gives a row per Mon-Sun week from your first session's week to this week, empty weeks included", () => {
    const ticks = [
      tick('t1', 'p3', '2026-09-01'), // Tue
      tick('t2', 'p2', '2026-09-03'), // Thu, same week
      tick('t3', 'p3', '2026-09-15'), // Tue, two weeks on -- a repeat
      tick('t4', 'p1', '2026-09-02', 'Shawn'),
    ];
    expect(weeklyProgress(PROBLEMS, ticks, 'Rob', '2026-09-17')).toEqual([
      { weekStart: '2026-08-31', sessions: 2, top: 3, newTicks: 2, repeats: 0, ticked: 2 },
      { weekStart: '2026-09-07', sessions: 0, top: null, newTicks: 0, repeats: 0, ticked: 2 },
      { weekStart: '2026-09-14', sessions: 1, top: 2, newTicks: 0, repeats: 1, ticked: 2 },
    ]);
  });

  it('counts a problem logged twice in a day once, and counts repeats in the hardest send', () => {
    const ticks = [
      tick('t1', 'p1', '2026-09-01', 'Rob', '2026-09-01T10:00:00Z'),
      tick('t2', 'p1', '2026-09-01', 'Rob', '2026-09-01T11:00:00Z'),
      tick('t3', 'p1', '2026-09-08'),
    ];
    const weeks = weeklyProgress(PROBLEMS, ticks, 'Rob', '2026-09-08');
    expect(weeks[0]).toMatchObject({ sessions: 1, newTicks: 1, repeats: 0, top: 5 });
    expect(weeks[1]).toMatchObject({ sessions: 1, newTicks: 0, repeats: 1, top: 5 });
  });

  it('keeps a week together across a year end', () => {
    const ticks = [tick('t1', 'p1', '2026-12-31'), tick('t2', 'p2', '2027-01-01')];
    expect(weeklyProgress(PROBLEMS, ticks, 'Rob', '2027-01-02')).toEqual([
      { weekStart: '2026-12-28', sessions: 2, top: 5, newTicks: 2, repeats: 0, ticked: 2 },
    ]);
  });

  it('shows the last 52 weeks at most, still counting older ticks in the running total', () => {
    const ticks = [tick('t1', 'p1', '2025-06-03'), tick('t2', 'p2', '2026-09-01')];
    const weeks = weeklyProgress(PROBLEMS, ticks, 'Rob', '2026-09-03');
    expect(weeks).toHaveLength(MAX_WEEKS);
    expect(weeks[0]).toMatchObject({ weekStart: '2025-09-08', ticked: 1 });
    expect(weeks[MAX_WEEKS - 1]).toMatchObject({ weekStart: '2026-08-31', newTicks: 1, ticked: 2 });
  });

  it('leaves the hardest send blank for a week of only ungraded problems', () => {
    expect(weeklyProgress(PROBLEMS, [tick('t1', 'p4', '2026-09-01')], 'Rob', '2026-09-02')).toEqual([
      { weekStart: '2026-08-31', sessions: 1, top: null, newTicks: 1, repeats: 0, ticked: 1 },
    ]);
  });

  it('ignores sends on problems no longer on the board', () => {
    expect(weeklyProgress(PROBLEMS, [tick('t1', 'p9', '2026-09-01')], 'Rob', '2026-09-02')).toEqual([]);
  });

  it("doesn't grow weeks for a send dated in the future", () => {
    const ticks = [tick('t1', 'p1', '2026-09-01'), tick('t2', 'p2', '2026-12-25')];
    const weeks = weeklyProgress(PROBLEMS, ticks, 'Rob', '2026-09-03');
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-08-31']);
  });
});

describe('progressTiles', () => {
  it("gives your hardest send ever, sessions a week over the last 28 days, and problems ticked", () => {
    const ticks = [
      tick('t1', 'p1', '2025-06-03'), // a year ago, still your hardest
      tick('t2', 'p2', '2026-09-01'),
      tick('t3', 'p3', '2026-09-08'),
      tick('t4', 'p3', '2026-09-15'),
      tick('t5', 'p2', '2026-09-30'), // in the future -- not counted in the last 28 days
    ];
    expect(progressTiles(PROBLEMS, ticks, 'Rob', '2026-09-17')).toEqual({
      hardest: 5, sessionsPerWeek: 0.8, ticked: 3, total: 4,
    });
  });

  it('has no hardest send before you send anything graded', () => {
    expect(progressTiles(PROBLEMS, [], 'Rob', '2026-09-17')).toEqual({ hardest: null, sessionsPerWeek: 0, ticked: 0, total: 4 });
  });
});

describe('ticklist', () => {
  it('counts what you have ticked at each grade that has problems, leaving out ungraded ones', () => {
    const ticks = [tick('t1', 'p2', '2026-09-01'), tick('t2', 'p4', '2026-09-01'), tick('t3', 'p1', '2026-09-02', 'Shawn')];
    expect(ticklist(PROBLEMS, ticks, 'Rob')).toEqual([
      { grade: 2, ticked: 0, total: 1 },
      { grade: 3, ticked: 1, total: 1 },
      { grade: 5, ticked: 0, total: 1 },
    ]);
  });
});

describe('mostClimbed', () => {
  it('ranks by sessions, not sends, with ties going to the most recent', () => {
    const ticks = [
      tick('t1', 'p3', '2026-09-01'), tick('t2', 'p3', '2026-09-01', 'Rob', '2026-09-01T19:00:00Z'),
      tick('t3', 'p3', '2026-09-08'),
      tick('t4', 'p2', '2026-09-01'), tick('t5', 'p2', '2026-09-10'),
      tick('t6', 'p1', '2026-09-01'),
    ];
    expect(mostClimbed(PROBLEMS, ticks, 'Rob')).toEqual([
      { id: 'p2', name: 'Crimpy Corner', grade: 'V3', sessions: 2 },
      { id: 'p3', name: 'Jug Haul', grade: 'V2', sessions: 2 },
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', sessions: 1 },
    ]);
    expect(mostClimbed(PROBLEMS, ticks, 'Rob', 1)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/progress.test.js`
Expected: FAIL, because `./progress` can't be resolved.

- [ ] **Step 3: Write the implementation** at `board-app/src/lib/progress.js`

```js
import { buildLogbook } from './sends';
import { gradeNumber } from './problemList';
import { addDays, weekStartOf } from './dates';

// The week charts show up to a year, rolling after that.
export const MAX_WEEKS = 52;

function hardestOf(problems) {
  const grades = problems.map((p) => gradeNumber(p.grade)).filter((g) => g !== null);
  return grades.length ? Math.max(...grades) : null;
}

const sentIds = (days) => new Set(days.flatMap((d) => d.problems.map((p) => p.id)));

// One row per Mon-Sun week, from the week of the climber's first session to
// this week, capped to the last MAX_WEEKS. Built on buildLogbook, so a session
// is a day, a problem logged twice in a day counts once, and sends on problems
// no longer on the board are left out. "top" counts repeats: it's how hard
// you climbed that week, not only what was new.
export function weeklyProgress(problems, ticks, climberName, today) {
  const days = [...buildLogbook(problems, ticks, climberName)].reverse(); // oldest first
  if (days.length === 0) return [];
  const thisWeek = weekStartOf(today);
  const windowStart = addDays(thisWeek, -7 * (MAX_WEEKS - 1));
  const firstWeek = weekStartOf(days[0].date);
  const start = firstWeek > windowStart ? firstWeek : windowStart;

  const weeks = [];
  const byStart = new Map();
  for (let w = start; w <= thisWeek; w = addDays(w, 7)) {
    const week = { weekStart: w, sessions: 0, top: null, newTicks: 0, repeats: 0, ticked: 0 };
    weeks.push(week);
    byStart.set(w, week);
  }

  // Problems ticked before the window still count towards the running total.
  let ticked = 0;
  for (const day of days) {
    const fresh = day.problems.filter((p) => p.firstSend).length;
    if (day.date < start) {
      ticked += fresh;
      continue;
    }
    const week = byStart.get(weekStartOf(day.date));
    if (!week) continue; // dated after this week
    week.sessions += 1;
    week.newTicks += fresh;
    week.repeats += day.problems.length - fresh;
    const top = hardestOf(day.problems);
    if (top !== null && (week.top === null || top > week.top)) week.top = top;
  }
  for (const week of weeks) {
    ticked += week.newTicks;
    week.ticked = ticked;
  }
  return weeks;
}

// The three headline numbers. Sessions a week is the last 28 days (today
// included) over four, to one decimal.
export function progressTiles(problems, ticks, climberName, today) {
  const days = buildLogbook(problems, ticks, climberName);
  const from = addDays(today, -27);
  const recent = days.filter((d) => d.date >= from && d.date <= today).length;
  return {
    hardest: hardestOf(days.flatMap((d) => d.problems)),
    sessionsPerWeek: Math.round((recent / 4) * 10) / 10,
    ticked: sentIds(days).size,
    total: problems.length,
  };
}

// A row for each grade that has problems on the board, easiest first.
export function ticklist(problems, ticks, climberName) {
  const sent = sentIds(buildLogbook(problems, ticks, climberName));
  const graded = problems.map((p) => ({ id: p.id, grade: gradeNumber(p.grade) })).filter((p) => p.grade !== null);
  return [...new Set(graded.map((p) => p.grade))].sort((a, b) => a - b).map((grade) => {
    const atGrade = graded.filter((p) => p.grade === grade);
    return { grade, ticked: atGrade.filter((p) => sent.has(p.id)).length, total: atGrade.length };
  });
}

// The problems you've sent in the most sessions; a tie goes to the one you
// climbed most recently.
export function mostClimbed(problems, ticks, climberName, limit = 5) {
  const counts = new Map();
  // Newest day first, so the first time a problem turns up is its latest session.
  for (const day of buildLogbook(problems, ticks, climberName)) {
    for (const p of day.problems) {
      const entry = counts.get(p.id) || { id: p.id, name: p.name, grade: p.grade, sessions: 0, last: day.date };
      entry.sessions += 1;
      counts.set(p.id, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.sessions - a.sessions || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
    .slice(0, limit)
    .map(({ id, name, grade, sessions }) => ({ id, name, grade, sessions }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/progress.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: Sync the spec with two decisions made while planning.** In `docs/superpowers/specs/2026-10-21-logbook-progress-and-board-stats-design.md`, make two replacements.

  **Replacement 1**, in the Progress tab list. Replace:
  ```
  4. **Board ticklist:** a row per grade, V0 up to the hardest grade on the
     board, with a track sized to that grade's problem count, filled for how
     many you've ticked, and a "7/9" label. Ungraded problems are left out.
  ```
  with:
  ```
  4. **Board ticklist:** a row for each grade that has problems on the board,
     easiest first, with a track sized to that grade's problem count, filled
     for how many you've ticked, and a "7/9" label. Ungraded problems are left
     out.
  ```

  **Replacement 2**, in Pure modules. Replace:
  ```
  - `weekStartOf(dateStr)`: the Monday of that date, as `YYYY-MM-DD`.
  ```
  with:
  ```
  Date helpers (`localDate`, `addDays`, `daysBetween`, `weekStartOf`,
  `monthOf`, `previousMonth`, `nextMonth`, `monthName`) live in
  `src/lib/dates.js` and are shared by both modules.
  ```

- [ ] **Step 6: Commit and push**

```bash
git add src/lib/progress.js src/lib/progress.test.js ../docs/superpowers/specs/2026-10-21-logbook-progress-and-board-stats-design.md
git commit -m "$(printf 'feat: work out weekly progress, headline numbers, ticklist and most-climbed\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
git push
```

---

### Task 4: One-line session rows with month headings

**Files:**
- Modify: `board-app/src/ui.js` (add `visuallyHidden`)
- Modify: `board-app/src/logbook/LogbookScreen.jsx` (rows and headings)
- Test: `board-app/src/App.test.jsx` (the `App (logbook)`, `App (flash)` and `App (list scroll position)` blocks)

**Interfaces:**
- Consumes: `monthOf` from `../lib/dates`, and `sectionHeading` from `../ui`.
- Produces: `visuallyHidden` (a style object) from `src/ui.js`. A day button's text is now e.g. `Tue 1 Sept` + `2 problems · 2 new · 1 flash`, with the bolt drawn as an icon and the word "flash" hidden from view but kept for screen readers.

- [ ] **Step 1: Update the existing logbook tests to the new row text.** In `board-app/src/App.test.jsx`:

  1. In `describe('App (logbook)'`, add this line directly after `const day = (label) => …;`:
     ```js
     const DAY_ROW = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d/;
     ```
  2. In the test `'opens from beside the climber pill with every day collapsed, newest first'`, replace:
     ```js
     const days = screen.getAllByRole('button', { name: /Sept 2026/ });
     expect(days.map((d) => d.textContent)).toEqual([
       'Tue 8 Sept 20261 problem',
       'Tue 1 Sept 20262 problems · 2 new · 1 flash',
     ]);
     ```
     with:
     ```js
     expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
     const days = screen.getAllByRole('button', { name: DAY_ROW });
     expect(days.map((d) => d.textContent)).toEqual([
       'Tue 8 Sept1 problem',
       'Tue 1 Sept2 problems · 2 new · 1 flash',
     ]);
     ```
  3. Throughout `describe('App (logbook)'`, replace every `day('Tue 1 Sept 2026')` with `day('Tue 1 Sept')`, and every `day('Tue 8 Sept 2026')` with `day('Tue 8 Sept')`.
  4. In `"says so when you haven't logged anything yet"`, replace `screen.queryAllByRole('button', { name: /Sept 2026/ })` with `screen.queryAllByRole('button', { name: DAY_ROW })`.
  5. In `describe('App (flash)'`, replace `/Sat 22 Aug 2026.*1 problem · 1 new · 1 flash/` with `/Sat 22 Aug.*1 problem · 1 new · 1 flash/`.
  6. In `describe('App (list scroll position)'`, replace both `{ name: /Tue 1 Sept 2026/ }` with `{ name: /Tue 1 Sept/ }`.

- [ ] **Step 2: Add a test for month headings and the flash bolt** inside `describe('App (logbook)'`, after the first test:

```js
  it('puts a heading above each month, newest first, and shows flashes as a bolt and a count', async () => {
    listBoardTicks.mockResolvedValue([
      ...TICKS,
      { id: 't9', problem_id: 'p3', sent_by: 'Rob', sent_on: '2026-10-02', created_at: '2026-10-02T10:00:00Z', flash: true },
    ]);
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('You: Rob');
    await user.click(screen.getByRole('button', { name: 'Logbook' }));

    expect(screen.getAllByRole('heading', { name: /^(October|September) 2026$/ }).map((h) => h.textContent))
      .toEqual(['October 2026', 'September 2026']);
    const october = screen.getByRole('button', { name: /^Fri 2 Oct/ });
    expect(october.textContent).toBe('Fri 2 Oct1 problem · 1 new · 1 flash');
    expect(october.querySelector('svg')).not.toBeNull();
  });
```

- [ ] **Step 3: Run the logbook tests to verify they fail**

Run: `npx vitest run src/App.test.jsx -t "logbook|flash|scroll"`
Expected: FAIL. The rows still read `Tue 1 Sept 2026…`, and there's no month heading.

- [ ] **Step 4: Add `visuallyHidden` to `board-app/src/ui.js`.** Append:

```js
// Kept for screen readers (and for tests reading a button's name), never shown.
export const visuallyHidden = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
};
```

- [ ] **Step 5: Rewrite `board-app/src/logbook/LogbookScreen.jsx`** with this full content:

```jsx
import { ChevronDown, Zap } from 'lucide-react';
import { buildLogbook } from '../lib/sends';
import { monthOf } from '../lib/dates';
import { sectionHeading, visuallyHidden } from '../ui';

const mono = "'JetBrains Mono', monospace";

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// No year -- that's in the month headings, so a row fits on one line on a phone.
function formatDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  return `${weekday} ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

function formatMonth(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

const badge = { borderRadius: 999, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 };

function Day({ day, open, onToggle, onOpenProblem }) {
  const fresh = day.problems.filter((p) => p.firstSend).length;
  const flashed = day.problems.filter((p) => p.flashed).length;
  const summary = [count(day.problems.length, 'problem'), fresh > 0 && `${fresh} new`].filter(Boolean).join(' · ');

  return (
    <section style={{ background: '#232427', border: '1px solid #2A2B2E', borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
      <button aria-expanded={open} onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none',
        color: '#EDEAE3', padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
      }}>
        {/* Always one line: on a very narrow phone the counts give way with an
            ellipsis rather than dropping under the date. */}
        <span style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap' }}>{formatDay(day.date)}</span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, color: '#8b8d91' }}>
            {summary}
            {flashed > 0 && (
              <>
                {' · '}
                <Zap size={12} color="#C9A227" aria-hidden="true" style={{ verticalAlign: -1, marginRight: 2 }} />
                {flashed}
                <span style={visuallyHidden}>{flashed === 1 ? ' flash' : ' flashes'}</span>
              </>
            )}
          </span>
        </span>
        <ChevronDown size={16} color="#8b8d91" aria-hidden="true" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <ul style={{ listStyle: 'none', margin: 0, padding: '0 6px 6px' }}>
          {day.problems.map((p) => (
            <li key={p.id}>
              <button onClick={() => onOpenProblem(p.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none',
                borderTop: '1px solid #2A2B2E', color: '#EDEAE3', padding: '10px 8px', cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ width: 34, flexShrink: 0, fontFamily: mono, fontSize: 13, fontWeight: 700, color: '#D9552B' }}>{p.grade}</span>
                <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
                {p.firstSend && <span style={{ ...badge, background: '#5C8A66', color: '#17181A' }}>New</span>}
                {p.flashed && (
                  <span style={{ ...badge, display: 'flex', alignItems: 'center', gap: 3, background: '#C9A227', color: '#17181A' }}>
                    <Zap size={11} />Flash
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// A heading above the first session of each month -- a label, not a row.
function Sessions({ days, openDays, onToggleDay, onOpenProblem }) {
  let month = null;
  return days.map((d) => {
    const first = month === null;
    const heading = monthOf(d.date) !== month;
    month = monthOf(d.date);
    return (
      <div key={d.date}>
        {heading && <h3 style={{ ...sectionHeading, margin: first ? '0 0 8px' : '16px 0 8px' }}>{formatMonth(month)}</h3>}
        <Day day={d} open={openDays.has(d.date)} onToggle={() => onToggleDay(d.date)} onOpenProblem={onOpenProblem} />
      </div>
    );
  });
}

export default function LogbookScreen({ problems, ticks, climber, openDays, onToggleDay, onOpenProblem, onPickClimber }) {
  if (!climber) {
    return (
      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#8b8d91' }}>
        <span style={{ fontSize: 13.5 }}>Select who you are to see your logbook</span>
        <button onClick={onPickClimber} style={{
          background: 'none', border: '1px solid #3a3b3e', color: '#8b8d91',
          borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
        }}>Pick a climber</button>
      </div>
    );
  }

  const days = buildLogbook(problems, ticks, climber.name);
  const sends = days.reduce((sum, d) => sum + d.problems.length, 0);

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 0.5, margin: 0 }}>{climber.name}'s logbook</h2>
      <p style={{ margin: '2px 0 16px', fontSize: 13, color: '#8b8d91' }}>
        {days.length > 0 ? `${count(days.length, 'session')} · ${count(sends, 'send')}` : 'Nothing logged yet'}
      </p>
      <Sessions days={days} openDays={openDays} onToggleDay={onToggleDay} onOpenProblem={onOpenProblem} />
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.jsx`
Expected: PASS (every test in the file).

- [ ] **Step 7: Commit and push**

```bash
git add src/ui.js src/logbook/LogbookScreen.jsx src/App.test.jsx
git commit -m "$(printf 'fix: keep logbook rows on one line, with the year moved to month headings\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
git push
```

---

### Task 5: The week charts

**Files:**
- Create: `board-app/src/logbook/WeekCharts.jsx`
- Test: `board-app/src/logbook/WeekCharts.test.jsx`

**Interfaces:**
- Consumes:
  - the `Week[]` shape from Task 3: `{ weekStart, sessions, top, newTicks, repeats, ticked }`;
  - `sectionHeading` from `../ui`.
- Produces: `<WeekCharts weeks={Week[]} total={number} selected={number} onSelect={(index: number) => void} />`, the default export.
  - It renders a focusable `role="group"` whose name starts "Weekly charts".
  - It contains four SVGs tagged `data-chart="grade" | "sessions" | "volume" | "ticked"`.
  - In the volume chart, the bar segments are tagged `data-part="new" | "repeats"`.

- [ ] **Step 1: Write the failing test** at `board-app/src/logbook/WeekCharts.test.jsx`

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WeekCharts from './WeekCharts';

const week = (weekStart, sessions, top, newTicks, repeats, ticked) => ({ weekStart, sessions, top, newTicks, repeats, ticked });
const WEEKS = [
  week('2026-08-31', 1, 0, 2, 0, 2),
  week('2026-09-07', 2, 5, 3, 4, 5),
  week('2026-09-14', 0, null, 0, 0, 5),
];
const charts = () => screen.getByRole('group', { name: /^Weekly charts/ });

describe('WeekCharts', () => {
  it('steps through the weeks with the arrow keys, stopping at either end', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<WeekCharts weeks={WEEKS} total={10} selected={2} onSelect={onSelect} />);
    fireEvent.keyDown(charts(), { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(charts(), { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith(2);
    rerender(<WeekCharts weeks={WEEKS} total={10} selected={0} onSelect={onSelect} />);
    fireEvent.keyDown(charts(), { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith(0);
  });

  it('draws a sessions bar for each week climbed, leaving a gap for a week off', () => {
    const { container } = render(<WeekCharts weeks={WEEKS} total={10} selected={2} onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-chart="sessions"] path')).toHaveLength(2);
  });

  it('plots the hardest send only for weeks with a graded send', () => {
    const { container } = render(<WeekCharts weeks={WEEKS} total={10} selected={2} onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-chart="grade"] circle')).toHaveLength(2);
  });

  it('splits each week into new ticks and repeats', () => {
    const { container } = render(<WeekCharts weeks={WEEKS} total={10} selected={2} onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-chart="volume"] [data-part="new"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-chart="volume"] [data-part="repeats"]')).toHaveLength(1);
  });

  it('drops the dots past 20 weeks, keeping the latest week and the picked one', () => {
    const many = Array.from({ length: 25 }, (_, i) => week(`2026-01-${String(i + 1).padStart(2, '0')}`, 1, 3, 1, 0, i + 1));
    const { container } = render(<WeekCharts weeks={many} total={30} selected={10} onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-chart="grade"] circle')).toHaveLength(2);
  });

  it('draws a single week without breaking', () => {
    const { container } = render(<WeekCharts weeks={[WEEKS[0]]} total={10} selected={0} onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-chart="sessions"] path')).toHaveLength(1);
    expect(container.querySelectorAll('[data-chart="grade"] circle')).toHaveLength(1);
    expect(container.innerHTML).not.toContain('NaN');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/logbook/WeekCharts.test.jsx`
Expected: FAIL, because `./WeekCharts` can't be resolved.

- [ ] **Step 3: Write the component** at `board-app/src/logbook/WeekCharts.jsx`

```jsx
import { useRef } from 'react';
import { sectionHeading } from '../ui';

// Four charts on one set of week columns, so a week lines up all the way down
// the panel. Each is drawn in a W-wide viewBox and stretched to the panel.
const W = 326;
const LX = 24; // room for the y-axis labels
const ACCENT = '#D9552B';
const REPEAT = '#76787d';
const GRID = '#34353a';
const BAND = '#2d2e32';
const MUTED = '#8b8d91';
const SURFACE = '#232427';
const MONO = "'JetBrains Mono', monospace";
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Past this many weeks a dot on every week turns the line into a string of beads.
const DOTS_UP_TO = 20;

const eyebrow = { ...sectionHeading, fontSize: 10.5, margin: '0 0 6px' };
const legendKey = (color) => ({ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: color, marginRight: 5, verticalAlign: -1 });

// A bar with a rounded top and a square foot on the baseline.
function bar(x, y, w, h, r = 4) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

const roundUp = (value, step) => Math.max(step, Math.ceil(value / step) * step);
const unique = (values) => [...new Set(values)];

export default function WeekCharts({ weeks, total, selected, onSelect }) {
  const plotRef = useRef(null);
  const n = weeks.length;
  const pitch = (W - LX) / n;
  const cx = (i) => LX + i * pitch + pitch / 2;
  const bw = Math.min(16, Math.max(2, pitch - 2));
  const showDot = (i) => n <= DOTS_UP_TO || i === selected || i === n - 1;

  // A tap picks the nearest week, so a 6px column is still easy to hit, and
  // dragging keeps picking as you go.
  const pick = (clientX) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const x = ((clientX - rect.left) / rect.width) * W;
    onSelect(Math.min(n - 1, Math.max(0, Math.floor((x - LX) / pitch))));
  };
  const onKeyDown = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    onSelect(Math.min(n - 1, Math.max(0, selected + step)));
  };

  const band = (h) => <rect x={LX + selected * pitch + 1} y={0} width={Math.max(2, pitch - 2)} height={h} rx={4} fill={BAND} />;
  const grid = (values, y, label) => values.map((v) => (
    <g key={v}>
      <line x1={LX} x2={W} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
      <text x={LX - 6} y={y(v) + 3} textAnchor="end" fontFamily={MONO} fontSize={8.5} fill={MUTED}>{label(v)}</text>
    </g>
  ));
  // Under the first week of each month, skipping any that would collide.
  const monthLabels = (h) => {
    let lastX = -Infinity;
    return weeks.map((w, i) => {
      const x = LX + i * pitch + 2;
      if ((i > 0 && Number(w.weekStart.slice(8)) > 7) || x - lastX < 24) return null;
      lastX = x;
      return <text key={w.weekStart} x={x} y={h - 1} fontSize={9} fill={MUTED}>{MONTHS[Number(w.weekStart.slice(5, 7)) - 1]}</text>;
    });
  };
  const svg = (h, chart) => ({
    viewBox: `0 0 ${W} ${h}`, width: '100%', 'aria-hidden': true, 'data-chart': chart,
    fontFamily: "'Inter', sans-serif", style: { display: 'block', overflow: 'visible' },
  });

  // Hardest send: gridlines every two grades, at least up to V6.
  const gradeMax = roundUp(Math.max(6, ...weeks.map((w) => w.top ?? 0)), 2);
  const GH = 92;
  const gy = (g) => 7 + ((gradeMax - g) / gradeMax) * (GH - 14);
  const points = weeks.flatMap((w, i) => (w.top === null ? [] : [{ i, x: cx(i), y: gy(w.top) }]));

  // Sessions: 0-2, growing only if a week has more.
  const sessionMax = Math.max(2, ...weeks.map((w) => w.sessions));
  const SH = 56;
  const sy = (v) => 4 + (1 - v / sessionMax) * (SH - 17);
  const sessionTicks = sessionMax <= 4
    ? Array.from({ length: sessionMax + 1 }, (_, k) => k)
    : unique([0, Math.round(sessionMax / 2), sessionMax]);

  const volumeMax = roundUp(Math.max(...weeks.map((w) => w.newTicks + w.repeats)), 10);
  const VH = 84;
  const vy = (v) => 4 + (1 - v / volumeMax) * (VH - 17);

  const tickedMax = Math.max(1, total, ...weeks.map((w) => w.ticked));
  const CH = 84;
  const ty = (v) => 6 + (1 - v / tickedMax) * (CH - 19);
  const runningLine = weeks.map((w, i) => `${cx(i)},${ty(w.ticked)}`).join(' ');

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label="Weekly charts. Use the left and right arrow keys to pick a week."
      onKeyDown={onKeyDown}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); pick(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons) pick(e.clientX); }}
      style={{
        background: SURFACE, border: '1px solid #2A2B2E', borderRadius: 10, padding: 11, marginBottom: 10,
        touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer',
      }}
    >
      <div ref={plotRef}>
        <h3 style={eyebrow}>Hardest send each week</h3>
        <svg {...svg(GH, 'grade')}>
          {band(GH)}
          {grid(Array.from({ length: gradeMax / 2 + 1 }, (_, k) => k * 2), gy, (v) => `V${v}`)}
          {points.length > 1 && (
            <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {points.filter((p) => showDot(p.i)).map((p) => (
            <circle key={p.i} cx={p.x} cy={p.y} r={p.i === selected ? 5 : 4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
          ))}
        </svg>

        <h3 style={{ ...eyebrow, marginTop: 14 }}>Sessions each week</h3>
        <svg {...svg(SH, 'sessions')}>
          {band(SH)}
          {grid(sessionTicks, sy, String)}
          {weeks.map((w, i) => (w.sessions > 0
            ? <path key={w.weekStart} d={bar(cx(i) - bw / 2, sy(w.sessions), bw, sy(0) - sy(w.sessions))} fill={ACCENT} />
            : null))}
          {monthLabels(SH)}
        </svg>

        <h3 style={{ ...eyebrow, marginTop: 14 }}>Problems each week</h3>
        <div style={{ display: 'flex', gap: 12, fontSize: 10.5, color: '#c7c8cb', margin: '-2px 0 6px' }}>
          <span><i style={legendKey(ACCENT)} />New ticks</span>
          <span><i style={legendKey(REPEAT)} />Repeats</span>
        </div>
        <svg {...svg(VH, 'volume')}>
          {band(VH)}
          {grid(unique([0, volumeMax / 2, volumeMax]), vy, String)}
          {weeks.map((w, i) => {
            const x = cx(i) - bw / 2;
            const newTop = vy(w.newTicks);
            const repeatTop = vy(w.newTicks + w.repeats);
            // A 2px gap of card colour between the two parts of a bar.
            const repeatBottom = w.newTicks ? newTop - 2 : vy(0);
            return (
              <g key={w.weekStart}>
                {w.newTicks > 0 && (w.repeats > 0
                  ? <rect data-part="new" x={x} y={newTop} width={bw} height={vy(0) - newTop} fill={ACCENT} />
                  : <path data-part="new" d={bar(x, newTop, bw, vy(0) - newTop)} fill={ACCENT} />)}
                {w.repeats > 0 && repeatBottom > repeatTop && (
                  <path data-part="repeats" d={bar(x, repeatTop, bw, repeatBottom - repeatTop)} fill={REPEAT} />
                )}
              </g>
            );
          })}
          {monthLabels(VH)}
        </svg>

        <h3 style={{ ...eyebrow, marginTop: 14 }}>Problems ticked so far</h3>
        <svg {...svg(CH, 'ticked')}>
          {band(CH)}
          {grid(unique([0, Math.round(tickedMax / 2), tickedMax]), ty, String)}
          <text x={LX + 4} y={ty(tickedMax) + 11} fontSize={9} fill={MUTED}>{`of ${total} on the board`}</text>
          {n > 1 && <polygon points={`${cx(0)},${ty(0)} ${runningLine} ${cx(n - 1)},${ty(0)}`} fill={ACCENT} opacity={0.1} />}
          {n > 1 && <polyline points={runningLine} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {weeks.map((w, i) => (i === selected || i === n - 1
            ? <circle key={w.weekStart} cx={cx(i)} cy={ty(w.ticked)} r={4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
            : null))}
          {monthLabels(CH)}
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/logbook/WeekCharts.test.jsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit and push**

```bash
git add src/logbook/WeekCharts.jsx src/logbook/WeekCharts.test.jsx
git commit -m "$(printf 'feat: draw the four weekly charts on shared week columns\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
git push
```

---

### Task 6: Progress tab, and Sessions | Progress tabs in the logbook

**Files:**
- Create: `board-app/src/logbook/ProgressTab.jsx`
- Modify: `board-app/src/logbook/LogbookScreen.jsx` (add tabs and the Progress tab)
- Modify: `board-app/src/App.jsx` (the imports, the `logbookTab` state, and the `<LogbookScreen>` props)
- Test: `board-app/src/App.test.jsx` (a new nested describe inside `App (logbook)`)

**Interfaces:**
- Consumes:
  - `weeklyProgress`, `progressTiles`, `ticklist` and `mostClimbed` from `../lib/progress` (Task 3);
  - `WeekCharts` (Task 5);
  - `localDate` from `./lib/dates` (Task 1);
  - `formatShortDate` and `sectionHeading` from `../ui`.
- Produces:
  - `<ProgressTab problems ticks climber={string} today={string} onOpenProblem={(id) => void} />`
  - `LogbookScreen` gains the props `today: string`, `tab: 'sessions' | 'progress'` and `onTabChange(tab)`.

- [ ] **Step 1: Write the failing tests.** In `board-app/src/App.test.jsx`, add this nested describe at the end of `describe('App (logbook)'`, just before its closing `});`:

```js
  describe('Progress tab', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 10, 12)); // Thu 10 Sept 2026
    });
    afterEach(() => vi.useRealTimers());

    const tile = (label) => screen.getByText(label).parentElement;
    const readout = () => screen.getByText(/^Week of/).closest('p');

    it('switches to Progress, with your headline numbers and the latest week picked', async () => {
      const user = await openAs('Rob');
      await user.click(screen.getByRole('tab', { name: 'Progress' }));

      expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true');
      expect(tile('Hardest send')).toHaveTextContent('V5');
      expect(tile('Sessions a week, last 4 weeks')).toHaveTextContent('0.5');
      expect(tile('Problems ticked')).toHaveTextContent('2/3');
      expect(readout().textContent).toBe('Week of 7 Sept · 1 session · top V3 · 1 problem');
      expect(screen.queryAllByRole('button', { name: DAY_ROW })).toHaveLength(0);
      expect(screen.getByText('Board ticklist')).toBeInTheDocument();
    });

    it('picks an earlier week with the arrow keys', async () => {
      const user = await openAs('Rob');
      await user.click(screen.getByRole('tab', { name: 'Progress' }));
      fireEvent.keyDown(screen.getByRole('group', { name: /^Weekly charts/ }), { key: 'ArrowLeft' });
      expect(readout().textContent).toBe('Week of 31 Aug · 1 session · top V5 · 2 problems');
    });

    it("reads 'no sessions' for a week you didn't climb", async () => {
      vi.setSystemTime(new Date(2026, 8, 16, 12)); // Wed 16 Sept: this week is empty so far
      const user = await openAs('Rob');
      await user.click(screen.getByRole('tab', { name: 'Progress' }));
      expect(readout().textContent).toBe('Week of 14 Sept · no sessions');
    });

    it('opens one of your most-climbed, and comes back to the Progress tab', async () => {
      const user = await openAs('Rob');
      await user.click(screen.getByRole('tab', { name: 'Progress' }));
      expect(screen.getByRole('button', { name: /Crimpy Corner/ })).toHaveTextContent('×2');

      await user.click(screen.getByRole('button', { name: /Crimpy Corner/ }));
      expect(await screen.findByText('Log a send')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /logbook/i }));
      expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true');
    });

    it("prompts you to log a send when you haven't yet", async () => {
      const user = await openAs('Tom');
      await user.click(screen.getByRole('tab', { name: 'Progress' }));
      expect(screen.getByText('Log a send to start your progress')).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/App.test.jsx -t "Progress tab"`
Expected: FAIL, because there's no tab named "Progress".

- [ ] **Step 3: Write `board-app/src/logbook/ProgressTab.jsx`**

```jsx
import { useMemo, useState } from 'react';
import { weeklyProgress, progressTiles, ticklist, mostClimbed } from '../lib/progress';
import { formatShortDate, sectionHeading } from '../ui';
import WeekCharts from './WeekCharts';

const mono = "'JetBrains Mono', monospace";
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const panel = { background: '#232427', border: '1px solid #2A2B2E', borderRadius: 10, padding: 11, marginBottom: 10 };
const eyebrow = { ...sectionHeading, fontSize: 10.5, margin: '0 0 6px' };

// The picked week in one line: "Week of 12 Oct · 2 sessions · top V5 · 34 problems".
function readout(week) {
  const heading = `Week of ${formatShortDate(week.weekStart)}`;
  if (week.sessions === 0) return [heading, 'no sessions'];
  return [
    heading,
    count(week.sessions, 'session'),
    ...(week.top === null ? [] : [`top V${week.top}`]),
    count(week.newTicks + week.repeats, 'problem'),
  ];
}

function Tile({ value, label }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: '#232427', border: '1px solid #2A2B2E', borderRadius: 10, padding: '9px 10px' }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: '#8b8d91', lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

export default function ProgressTab({ problems, ticks, climber, today, onOpenProblem }) {
  const weeks = useMemo(() => weeklyProgress(problems, ticks, climber, today), [problems, ticks, climber, today]);
  const tiles = useMemo(() => progressTiles(problems, ticks, climber, today), [problems, ticks, climber, today]);
  const grades = useMemo(() => ticklist(problems, ticks, climber), [problems, ticks, climber]);
  const favourites = useMemo(() => mostClimbed(problems, ticks, climber), [problems, ticks, climber]);
  // null means "the latest week", so a new week becomes the default once it starts.
  const [picked, setPicked] = useState(null);

  if (weeks.length === 0) {
    return <p style={{ margin: '24px 0 0', textAlign: 'center', fontSize: 13.5, color: '#8b8d91' }}>Log a send to start your progress</p>;
  }

  const selected = picked !== null && picked < weeks.length ? picked : weeks.length - 1;
  const [heading, ...details] = readout(weeks[selected]);
  const widest = Math.max(1, ...grades.map((g) => g.total));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Tile value={tiles.hardest === null ? '–' : `V${tiles.hardest}`} label="Hardest send" />
        <Tile value={tiles.sessionsPerWeek.toFixed(1)} label="Sessions a week, last 4 weeks" />
        <Tile
          value={<>{tiles.ticked}<span style={{ fontSize: 13, color: '#8b8d91', fontWeight: 600 }}>/{tiles.total}</span></>}
          label="Problems ticked"
        />
      </div>

      <p aria-live="polite" style={{
        margin: '0 0 10px', background: '#17181A', border: '1px solid #3a3b3e', borderRadius: 8,
        padding: '7px 10px', fontSize: 12, color: '#c7c8cb',
      }}>
        <b style={{ color: '#EDEAE3' }}>{heading}</b>{details.map((part) => ` · ${part}`).join('')}
      </p>

      <WeekCharts weeks={weeks} total={tiles.total} selected={selected} onSelect={setPicked} />

      {grades.length > 0 && (
        <section style={panel}>
          <h3 style={eyebrow}>Board ticklist</h3>
          {grades.map((g) => (
            <div key={g.grade} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <span style={{ width: 24, fontFamily: mono, fontSize: 11, fontWeight: 700, color: '#c7c8cb' }}>V{g.grade}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', width: `${(g.total / widest) * 100}%`, height: 10, borderRadius: 3, background: '#34353a', overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: `${(g.ticked / g.total) * 100}%`, height: '100%', background: '#D9552B' }} />
                </span>
              </span>
              <span style={{ width: 40, textAlign: 'right', fontFamily: mono, fontSize: 11, color: '#8b8d91' }}>{g.ticked}/{g.total}</span>
            </div>
          ))}
        </section>
      )}

      {favourites.length > 0 && (
        <section style={panel}>
          <h3 style={eyebrow}>Your most-climbed</h3>
          {favourites.map((p, i) => (
            <button key={p.id} onClick={() => onOpenProblem(p.id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
              borderTop: i ? '1px solid #2A2B2E' : 'none', color: '#EDEAE3', padding: '8px 2px', fontSize: 13,
              cursor: 'pointer', textAlign: 'left', fontFamily: "'Inter'",
            }}>
              <span style={{ width: 24, flexShrink: 0, fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#D9552B' }}>{p.grade || '–'}</span>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              <span style={{ fontSize: 12, color: '#8b8d91' }}>×{p.sessions}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the tabs to `board-app/src/logbook/LogbookScreen.jsx`**

  1. Add this import after the `../ui` import:
     ```jsx
     import ProgressTab from './ProgressTab';
     ```
  2. Add this component above `export default function LogbookScreen`:
     ```jsx
     const TABS = [['sessions', 'Sessions'], ['progress', 'Progress']];

     function Tabs({ tab, onChange }) {
       return (
         <div role="tablist" aria-label="Logbook view" style={{
           display: 'flex', gap: 4, background: '#232427', border: '1px solid #2A2B2E', borderRadius: 999, padding: 3, marginBottom: 14,
         }}>
           {TABS.map(([value, label]) => (
             <button key={value} role="tab" aria-selected={tab === value} onClick={() => onChange(value)} style={{
               flex: 1, border: 'none', borderRadius: 999, padding: '6px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
               fontFamily: "'Inter'", background: tab === value ? '#D9552B' : 'transparent', color: tab === value ? '#17181A' : '#8b8d91',
             }}>{label}</button>
           ))}
         </div>
       );
     }
     ```
  3. Change the signature line to:
     ```jsx
     export default function LogbookScreen({ problems, ticks, climber, today, tab, onTabChange, openDays, onToggleDay, onOpenProblem, onPickClimber }) {
     ```
  4. Replace the last line of the returned JSX, `<Sessions days={days} … />`, with:
     ```jsx
      <Tabs tab={tab} onChange={onTabChange} />
      {tab === 'progress'
        ? <ProgressTab problems={problems} ticks={ticks} climber={climber.name} today={today} onOpenProblem={onOpenProblem} />
        : <Sessions days={days} openDays={openDays} onToggleDay={onToggleDay} onOpenProblem={onOpenProblem} />}
     ```

- [ ] **Step 5: Wire it into `board-app/src/App.jsx`**

  1. After `import { todayISO } from './lib/warmup';` add:
     ```jsx
     import { localDate } from './lib/dates';
     ```
  2. Replace:
     ```jsx
       // Logbook days stay open while you look at one of their problems and come back.
       const [openLogbookDays, setOpenLogbookDays] = useState(() => new Set());
     ```
     with:
     ```jsx
       // Logbook days stay open, and the tab stays picked, while you look at one
       // of their problems and come back.
       const [openLogbookDays, setOpenLogbookDays] = useState(() => new Set());
       const [logbookTab, setLogbookTab] = useState('sessions');
     ```
  3. In the `<LogbookScreen` element, after `climber={currentClimber}`, add:
     ```jsx
            today={localDate()}
            tab={logbookTab}
            onTabChange={setLogbookTab}
     ```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.jsx`
Expected: PASS (every test in the file, including the 5 new Progress tab tests).

- [ ] **Step 7: Lint, then commit and push**

```bash
npm run lint
git add src/logbook/ProgressTab.jsx src/logbook/LogbookScreen.jsx src/App.jsx src/App.test.jsx
git commit -m "$(printf 'feat: add a Progress tab to the logbook\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
git push
```

---

### Task 7: Check it on a phone, then open PR 1

**Files:**
- Create (untracked, never committed): `board-app/preview.html`, `board-app/src/preview.jsx`

**Interfaces:**
- Consumes: the finished Part 1.
- Produces: PR 1, `feat/logbook-progress` → `main`.

- [ ] **Step 1: Run everything**

Run: `npm run lint && npm test && npm run build`
Expected: lint clean, all tests pass, build succeeds.

- [ ] **Step 2: Make a dev-only preview page** that opens the real app straight onto a screen, since the Simulator can't be tapped.

  1. Keep both files out of git:
     ```bash
     printf 'board-app/preview.html\nboard-app/src/preview.jsx\n' >> ../.git/info/exclude
     ```
  2. Create `board-app/preview.html` as a copy of `index.html`, with the script tag changed to `<script type="module" src="/src/preview.jsx"></script>`.
  3. Create `board-app/src/preview.jsx`:

     ```jsx
     // Dev-only, never committed: opens the real app straight onto a screen for
     // Simulator screenshots, e.g.
     // /preview.html?climber=Rob&open=Logbook&tab=Progress&width=360
     import { createRoot } from 'react-dom/client';
     import './index.css';
     import App from './App.jsx';
     import { listClimbers } from './lib/board';

     const params = new URLSearchParams(window.location.search);

     async function clickWhen(find) {
       for (let i = 0; i < 100; i += 1) {
         const el = find();
         if (el) { el.click(); return; }
         await new Promise((resolve) => setTimeout(resolve, 100));
       }
     }

     (async () => {
       const name = params.get('climber');
       if (name) {
         const climber = (await listClimbers()).find((c) => c.name === name);
         if (climber) localStorage.setItem('board-app:currentClimberId', climber.id);
       }
       const root = document.getElementById('root');
       if (params.get('width')) Object.assign(root.style, { width: `${params.get('width')}px`, margin: '0 auto', outline: '1px dashed #555' });
       createRoot(root).render(<App />);
       const open = params.get('open');
       if (open) await clickWhen(() => document.querySelector(`button[aria-label="${open}"]`));
       const tab = params.get('tab');
       if (tab) await clickWhen(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent === tab));
     })();
     ```

  This only reads data, so it's safe against the live database.

- [ ] **Step 3: Screenshot in the iOS Simulator** (iPhone 15, 393pt wide). Run the dev server in the background with `npm run dev -- --host`, then:

```bash
SIM=B388EDD2-1B40-41E0-A5F2-FF368E534B72
xcrun simctl boot $SIM 2>/dev/null; open -a Simulator
for q in "open=Logbook&tab=Sessions" "open=Logbook&tab=Progress" "open=Logbook&tab=Sessions&width=360" "open=Logbook&tab=Progress&width=360"; do
  xcrun simctl openurl $SIM "http://localhost:5173/preview.html?climber=Rob&$q"; sleep 6
  xcrun simctl io $SIM screenshot "/private/tmp/claude-501/-Users-roblatticetraining-projects-boardClimbing/997da668-5f4e-4abc-bf50-d32c2ddd25db/scratchpad/sim-$(echo $q | tr '&=' '__').png"
done
```

  Look at each screenshot and check:
  - every session row is on one line, with a month heading above each month and the gold bolt on flash days;
  - the four charts line up week for week, with month labels that don't overlap;
  - the tiles and the ticklist fit at 360px.

  Fix anything that's off before carrying on.

- [ ] **Step 4: Open PR 1**

```bash
git push
gh pr create --base main --head feat/logbook-progress --title "Logbook: Progress tab and one-line session rows" --body "$(cat <<'EOF'
## What's in it
- **Progress tab** in the logbook (Sessions | Progress):
  - headline numbers: hardest send, sessions a week over the last 4 weeks, problems ticked;
  - four weekly charts on shared week columns (hardest send, sessions, problems new vs repeats, running total). Tap or drag to pick a week;
  - board ticklist by grade;
  - your most-climbed problems.
- **Session rows** stay on one line. The year moves to month headings ("October 2026"), and flashes show as the gold bolt with a count.
- **Fix:** sends are now loaded in pages, so the board can pass 1,000 sends without the logbook or the Unsent filter going quietly wrong.

No database changes.

## Testing
- `npm test`, `npm run lint` and `npm run build` pass.
- New unit tests for the date helpers, progress calculations and charts. App tests cover the tabs, week picking and coming back from a problem.
- Checked in the iOS Simulator at 393px and in a 360px column.

Spec: `docs/superpowers/specs/2026-10-21-logbook-progress-and-board-stats-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Hand it to Rob to test.**
  - Give him the dev server's "Network" URL so he can open it on his phone on the same Wi-Fi.
  - Remind him it uses the live database: browsing is safe, but anything he logs is real.
  - Point him at the PR link, and at the Vercel preview link if one appears on the PR.

---

# Part 2: Board stats (PR 2)

### Task 8: Board stats calculations

**Files:**
- Create: `board-app/src/lib/boardStats.js`
- Test: `board-app/src/lib/boardStats.test.js`

**Interfaces:**
- Consumes:
  - `gradeNumber` from `./problemList`;
  - `firstSendIds(ticks): Set<tickId>` from `./sends`, which gives each named climber's earliest send of each problem;
  - `addDays`, `daysBetween` and `localDate` from `./dates`.
- Produces (`problems` is the live list, `ticks` all the board's sends):
  - `crewBoard(problems, ticks, month: 'YYYY-MM')` → `[{ name, problems, newTicks, flashes, top: number | null }]`, sorted by newTicks, then problems, then name.
  - `firstAscents(problems, ticks)` → `Map<problemId, { climber, date, loggedAt, repeats } | null>`. A problem never sent is absent. If its first send had no name, the value is `null`.
  - `latestFAs(problems, ticks, limit = 5)` → `[{ id, name, grade, climber, date, loggedAt, repeats }]`
  - `faTally(problems, ticks)` → `[{ name, count }]`
  - `classics(problems, ticks, limit = 5)` → `[{ id, name, grade, rating, ascents }]`
  - `popularLately(problems, ticks, today, limit = 5)` → `[{ id, name, grade, climbers, sends, last }]`
  - `openProjects(problems, ticks, today)` → `[{ id, name, grade, setter, daysOpen: number | null }]`
  - `leastClimbedLately(problems, ticks, today, limit = 5)` → `[{ id, name, grade, lastSent, daysAgo }]`
  - `daysAgoLabel(days)`, `openLabel(days)` and `repeatsLabel(repeats)`, all returning strings.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/roblatticetraining/projects/boardClimbing
git checkout feat/logbook-progress && git pull --ff-only
git checkout -b feat/board-stats
cd board-app
```

- [ ] **Step 2: Write the failing test** at `board-app/src/lib/boardStats.test.js`

```js
import { describe, it, expect } from 'vitest';
import {
  crewBoard, firstAscents, latestFAs, faTally, classics, popularLately, openProjects, leastClimbedLately,
  daysAgoLabel, openLabel, repeatsLabel,
} from './boardStats';

const P = (id, name, grade, extra = {}) => ({ id, name, grade, setter: 'Rob', rating: null, created_at: '2026-09-01T12:00:00Z', ...extra });
const T = (id, problemId, sentBy, sentOn, extra = {}) => ({
  id, problem_id: problemId, sent_by: sentBy, sent_on: sentOn, created_at: `${sentOn}T18:00:00Z`, flash: false, ...extra,
});

describe('crewBoard', () => {
  const PROBLEMS = [P('p1', 'Gaston Traverse', 'V5'), P('p2', 'Crimpy Corner', 'V3'), P('p3', 'Jug Haul', 'V2')];

  it("counts this month's problems once a day, new ticks, flashed new ticks and the hardest send", () => {
    const ticks = [
      T('t1', 'p1', 'Rob', '2026-09-28'), // last month: Rob's first send of p1
      T('t2', 'p1', 'Rob', '2026-10-02', { flash: true }), // a repeat -- its flash doesn't count
      T('t3', 'p1', 'Rob', '2026-10-02', { created_at: '2026-10-02T19:00:00Z' }), // same day, counted once
      T('t4', 'p2', 'Rob', '2026-10-03', { flash: true }),
      T('t5', 'p3', 'Shawn', '2026-10-05'),
      T('t6', 'p2', 'Shawn', '2026-10-06'),
      T('t7', 'p1', 'Shawn', '2026-10-06'),
      T('t8', 'p3', null, '2026-10-07'), // no name, so nobody's
    ];
    expect(crewBoard(PROBLEMS, ticks, '2026-10')).toEqual([
      { name: 'Shawn', problems: 3, newTicks: 3, flashes: 0, top: 5 },
      { name: 'Rob', problems: 2, newTicks: 1, flashes: 1, top: 5 },
    ]);
  });

  it('breaks a tie on new ticks by problems, then by name', () => {
    const ticks = [
      T('t1', 'p1', 'Bob', '2026-10-01'), T('t2', 'p1', 'Bob', '2026-10-02'),
      T('t3', 'p2', 'Alice', '2026-10-01'),
      T('t4', 'p3', 'Cara', '2026-10-01'),
    ];
    expect(crewBoard(PROBLEMS, ticks, '2026-10').map((r) => r.name)).toEqual(['Bob', 'Alice', 'Cara']);
  });

  it('is empty for a month with no named sends', () => {
    expect(crewBoard(PROBLEMS, [T('t1', 'p1', 'Rob', '2026-10-02')], '2026-11')).toEqual([]);
  });
});

describe('firstAscents', () => {
  const PROBLEMS = [P('p1', 'Gaston Traverse', 'V5'), P('p2', 'Crimpy Corner', 'V3'), P('p3', 'Jug Haul', 'V2')];

  it('gives the FA to the first send, breaking a same-day tie by whichever was logged first', () => {
    const ticks = [
      T('t1', 'p1', 'Shawn', '2026-09-02'),
      T('t2', 'p1', 'Rob', '2026-09-02', { created_at: '2026-09-02T09:00:00Z' }),
      T('t3', 'p1', 'Rob', '2026-09-10'),
      T('t4', 'p1', 'Will', '2026-09-11'),
    ];
    expect(firstAscents(PROBLEMS, ticks).get('p1')).toEqual({
      climber: 'Rob', date: '2026-09-02', loggedAt: '2026-09-02T09:00:00Z', repeats: 2,
    });
  });

  it('gives nobody the FA when the first send was logged without a name', () => {
    const fas = firstAscents(PROBLEMS, [T('t1', 'p2', null, '2026-08-30'), T('t2', 'p2', 'Rob', '2026-09-01')]);
    expect(fas.get('p2')).toBeNull();
  });

  it('leaves out problems never sent, and sends on problems no longer on the board', () => {
    const fas = firstAscents(PROBLEMS, [T('t1', 'p9', 'Rob', '2026-09-01')]);
    expect(fas.has('p3')).toBe(false);
    expect(fas.has('p9')).toBe(false);
  });
});

describe('latestFAs and faTally', () => {
  const PROBLEMS = [P('p1', 'Gaston Traverse', 'V5'), P('p2', 'Crimpy Corner', 'V3'), P('p3', 'Jug Haul', 'V2'), P('p4', 'Old One', 'V1')];
  const ticks = [
    T('t1', 'p1', 'Rob', '2026-09-01'),
    T('t2', 'p2', 'Shawn', '2026-10-01'),
    T('t3', 'p3', 'Rob', '2026-10-01', { created_at: '2026-10-01T20:00:00Z' }),
    T('t4', 'p4', null, '2026-08-01'),
  ];

  it('lists the most recent FAs first, leaving out ones nobody got', () => {
    expect(latestFAs(PROBLEMS, ticks).map((f) => [f.name, f.climber])).toEqual([
      ['Jug Haul', 'Rob'], ['Crimpy Corner', 'Shawn'], ['Gaston Traverse', 'Rob'],
    ]);
    expect(latestFAs(PROBLEMS, ticks, 1)).toHaveLength(1);
  });

  it('counts FAs per climber, most first', () => {
    expect(faTally(PROBLEMS, ticks)).toEqual([{ name: 'Rob', count: 2 }, { name: 'Shawn', count: 1 }]);
  });
});

describe('classics', () => {
  it('ranks rated problems by stars, then by different climbers, then by name', () => {
    const PROBLEMS = [
      P('p1', 'Zed', 'V5', { rating: 5 }), P('p2', 'Alpha', 'V4', { rating: 5 }),
      P('p3', 'Mid', 'V3', { rating: 4 }), P('p4', 'Unrated', 'V2'),
    ];
    const ticks = [T('t1', 'p1', 'Rob', '2026-09-01'), T('t2', 'p1', 'Rob', '2026-09-02'), T('t3', 'p1', 'Shawn', '2026-09-03'), T('t4', 'p4', 'Rob', '2026-09-03')];
    expect(classics(PROBLEMS, ticks)).toEqual([
      { id: 'p1', name: 'Zed', grade: 'V5', rating: 5, ascents: 2 },
      { id: 'p2', name: 'Alpha', grade: 'V4', rating: 5, ascents: 0 },
      { id: 'p3', name: 'Mid', grade: 'V3', rating: 4, ascents: 0 },
    ]);
  });
});

describe('popularLately', () => {
  it('ranks the last 30 days by different climbers, then sends, then the latest send', () => {
    const PROBLEMS = [P('p1', 'A', 'V1'), P('p2', 'B', 'V2'), P('p3', 'C', 'V3'), P('p4', 'D', 'V4')];
    const ticks = [
      T('t1', 'p1', 'Rob', '2026-10-21'), T('t2', 'p1', 'Shawn', '2026-09-22'), // 30 days ago, today included
      T('t3', 'p2', 'Rob', '2026-10-01'), T('t4', 'p2', 'Rob', '2026-10-02'),
      T('t5', 'p3', 'Will', '2026-10-05'),
      T('t6', 'p4', 'Rob', '2026-09-21'), T('t7', 'p4', 'Shawn', '2026-09-20'), // too long ago
      T('t8', 'p4', null, '2026-10-20'), // no name -- not a climber
    ];
    expect(popularLately(PROBLEMS, ticks, '2026-10-21').map((p) => [p.name, p.climbers])).toEqual([
      ['A', 2], ['B', 1], ['C', 1],
    ]);
  });
});

describe('openProjects', () => {
  it('lists problems nobody has sent, hardest first, ungraded last, then longest open', () => {
    const PROBLEMS = [
      P('p1', 'Sent', 'V6'),
      P('p2', 'Anon sent', 'V6'),
      P('p3', 'Hard', 'V5', { created_at: '2026-10-01T12:00:00Z' }),
      P('p4', 'Hard older', 'V5', { created_at: '2026-09-17T12:00:00Z', setter: 'Shawn' }),
      P('p5', 'Ungraded', '', { created_at: '2026-08-01T12:00:00Z' }),
      P('p6', 'Easy', 'V2', { created_at: '2026-10-20T12:00:00Z' }),
    ];
    const ticks = [T('t1', 'p1', 'Rob', '2026-10-01'), T('t2', 'p2', null, '2026-10-01')];
    expect(openProjects(PROBLEMS, ticks, '2026-10-21')).toEqual([
      { id: 'p4', name: 'Hard older', grade: 'V5', setter: 'Shawn', daysOpen: 34 },
      { id: 'p3', name: 'Hard', grade: 'V5', setter: 'Rob', daysOpen: 20 },
      { id: 'p6', name: 'Easy', grade: 'V2', setter: 'Rob', daysOpen: 1 },
      { id: 'p5', name: 'Ungraded', grade: '', setter: 'Rob', daysOpen: 81 },
    ]);
  });

  it("counts days open from the phone's own date, and copes with no created_at", () => {
    const PROBLEMS = [
      P('p1', 'Just after midnight', 'V3', { created_at: new Date(2026, 9, 21, 0, 15).toISOString() }),
      P('p2', 'Just before', 'V3', { created_at: new Date(2026, 9, 20, 23, 45).toISOString() }),
      P('p3', 'Unknown', 'V3', { created_at: undefined }),
    ];
    const byName = Object.fromEntries(openProjects(PROBLEMS, [], '2026-10-21').map((p) => [p.name, p.daysOpen]));
    expect(byName).toEqual({ 'Just after midnight': 0, 'Just before': 1, Unknown: null });
  });
});

describe('leastClimbedLately', () => {
  it("lists sent problems by how long it's been since a send, oldest first", () => {
    const PROBLEMS = [P('p1', 'A', 'V1'), P('p2', 'B', 'V2'), P('p3', 'Never', 'V3')];
    const ticks = [T('t1', 'p1', 'Rob', '2026-10-01'), T('t2', 'p1', 'Rob', '2026-10-20'), T('t3', 'p2', null, '2026-10-13')];
    expect(leastClimbedLately(PROBLEMS, ticks, '2026-10-21')).toEqual([
      { id: 'p2', name: 'B', grade: 'V2', lastSent: '2026-10-13', daysAgo: 8 },
      { id: 'p1', name: 'A', grade: 'V1', lastSent: '2026-10-20', daysAgo: 1 },
    ]);
  });
});

describe('labels', () => {
  it('reads naturally for 0, 1 and many', () => {
    expect([0, 1, 8].map(daysAgoLabel)).toEqual(['today', 'yesterday', '8 days ago']);
    expect([0, 1, 34].map(openLabel)).toEqual(['set today', 'open 1 day', 'open 34 days']);
    expect([0, 1, 3].map(repeatsLabel)).toEqual(['no repeats yet', '1 repeat', '3 repeats']);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/boardStats.test.js`
Expected: FAIL, because `./boardStats` can't be resolved.

- [ ] **Step 4: Write the implementation** at `board-app/src/lib/boardStats.js`

```js
import { gradeNumber } from './problemList';
import { firstSendIds } from './sends';
import { addDays, daysBetween, localDate } from './dates';

// Board-wide numbers for the stats screen. Each takes the live problems and
// all the board's sends; sends on problems no longer on the board are
// ignored. Only named sends credit a climber, but any send at all means a
// problem has been climbed.

const earliestFirst = (a, b) => (
  a.sent_on < b.sent_on ? -1 : a.sent_on > b.sent_on ? 1 : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
);
const newestFirst = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
const summary = ({ id, name, grade }) => ({ id, name, grade });
const latestSend = (list) => list.reduce((max, t) => (t.sent_on > max ? t.sent_on : max), '');
const climbersOn = (list) => new Set(list.filter((t) => t.sent_by).map((t) => t.sent_by));

function liveTicks(problems, ticks) {
  const ids = new Set(problems.map((p) => p.id));
  return ticks.filter((t) => ids.has(t.problem_id));
}

function groupByProblem(ticks) {
  const groups = new Map();
  for (const t of ticks) {
    if (!groups.has(t.problem_id)) groups.set(t.problem_id, []);
    groups.get(t.problem_id).push(t);
  }
  return groups;
}

// month is YYYY-MM. Problems counts each problem once a day; New is first
// sends that happened this month; Flashes is those logged as a flash.
export function crewBoard(problems, ticks, month) {
  const byId = new Map(problems.map((p) => [p.id, p]));
  const live = liveTicks(problems, ticks);
  const firsts = firstSendIds(live);
  const rows = new Map();
  const counted = new Set();
  for (const t of live) {
    if (!t.sent_by || !t.sent_on.startsWith(`${month}-`)) continue;
    if (!rows.has(t.sent_by)) rows.set(t.sent_by, { name: t.sent_by, problems: 0, newTicks: 0, flashes: 0, top: null });
    const row = rows.get(t.sent_by);
    const key = `${t.sent_by}|${t.problem_id}|${t.sent_on}`;
    if (!counted.has(key)) {
      counted.add(key);
      row.problems += 1;
    }
    if (firsts.has(t.id)) {
      row.newTicks += 1;
      if (t.flash) row.flashes += 1;
    }
    const grade = gradeNumber(byId.get(t.problem_id).grade);
    if (grade !== null && (row.top === null || grade > row.top)) row.top = grade;
  }
  return [...rows.values()].sort((a, b) => b.newTicks - a.newTicks || b.problems - a.problems || a.name.localeCompare(b.name));
}

// The FA is the first send. If that was logged before climber names existed,
// nobody gets it -- not even whoever sent it next. Problems never sent aren't
// in the map. Repeats are the other climbers who've sent it.
export function firstAscents(problems, ticks) {
  const fas = new Map();
  for (const [id, list] of groupByProblem(liveTicks(problems, ticks))) {
    const first = [...list].sort(earliestFirst)[0];
    fas.set(id, first.sent_by
      ? { climber: first.sent_by, date: first.sent_on, loggedAt: first.created_at, repeats: climbersOn(list).size - 1 }
      : null);
  }
  return fas;
}

export function latestFAs(problems, ticks, limit = 5) {
  const fas = firstAscents(problems, ticks);
  return problems
    .filter((p) => fas.get(p.id))
    .map((p) => ({ ...summary(p), ...fas.get(p.id) }))
    .sort((a, b) => newestFirst(a.date, b.date) || newestFirst(a.loggedAt, b.loggedAt))
    .slice(0, limit);
}

export function faTally(problems, ticks) {
  const counts = new Map();
  for (const fa of firstAscents(problems, ticks).values()) {
    if (fa) counts.set(fa.climber, (counts.get(fa.climber) || 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Ascents are different climbers, not laps.
export function classics(problems, ticks, limit = 5) {
  const groups = groupByProblem(liveTicks(problems, ticks));
  return problems
    .filter((p) => p.rating)
    .map((p) => ({ ...summary(p), rating: p.rating, ascents: climbersOn(groups.get(p.id) || []).size }))
    .sort((a, b) => b.rating - a.rating || b.ascents - a.ascents || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// The last 30 days, today included.
export function popularLately(problems, ticks, today, limit = 5) {
  const from = addDays(today, -29);
  const byId = new Map(problems.map((p) => [p.id, p]));
  const recent = liveTicks(problems, ticks).filter((t) => t.sent_on >= from && t.sent_on <= today);
  return [...groupByProblem(recent)]
    .map(([id, list]) => ({ ...summary(byId.get(id)), climbers: climbersOn(list).size, sends: list.length, last: latestSend(list) }))
    .filter((p) => p.climbers > 0)
    .sort((a, b) => b.climbers - a.climbers || b.sends - a.sends || newestFirst(a.last, b.last))
    .slice(0, limit);
}

// Never sent by anyone, named or not: hardest first, ungraded last, then the
// longest open first. created_at is a timestamp, so it's turned into the
// phone's own date before counting.
export function openProjects(problems, ticks, today) {
  const sent = new Set(ticks.map((t) => t.problem_id));
  return problems
    .filter((p) => !sent.has(p.id))
    .map((p) => ({
      ...summary(p),
      setter: p.setter,
      daysOpen: p.created_at ? Math.max(0, daysBetween(localDate(new Date(p.created_at)), today)) : null,
    }))
    .sort((a, b) => {
      const ga = gradeNumber(a.grade);
      const gb = gradeNumber(b.grade);
      if (ga !== gb) {
        if (ga === null) return 1;
        if (gb === null) return -1;
        return gb - ga;
      }
      return (b.daysOpen ?? -1) - (a.daysOpen ?? -1);
    });
}

export function leastClimbedLately(problems, ticks, today, limit = 5) {
  const groups = groupByProblem(liveTicks(problems, ticks));
  return problems
    .filter((p) => groups.has(p.id))
    .map((p) => {
      const lastSent = latestSend(groups.get(p.id));
      return { ...summary(p), lastSent, daysAgo: daysBetween(lastSent, today) };
    })
    .sort((a, b) => (a.lastSent < b.lastSent ? -1 : a.lastSent > b.lastSent ? 1 : a.name.localeCompare(b.name)))
    .slice(0, limit);
}

export function daysAgoLabel(days) {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function openLabel(days) {
  if (days <= 0) return 'set today';
  return `open ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function repeatsLabel(repeats) {
  if (repeats === 0) return 'no repeats yet';
  return `${repeats} ${repeats === 1 ? 'repeat' : 'repeats'}`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/boardStats.test.js`
Expected: PASS (14 tests).

- [ ] **Step 6: Commit and push**

```bash
git add src/lib/boardStats.js src/lib/boardStats.test.js
git commit -m "$(printf 'feat: work out the crew board, first ascents, classics and open projects\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
git push -u origin feat/board-stats
```

---

### Task 9: Board stats screen behind a trophy button

**Files:**
- Create: `board-app/src/stats/BoardStatsScreen.jsx`
- Modify: `board-app/src/App.jsx`. This covers:
  - the lucide import, and new imports;
  - a module-level `iconButton` style;
  - the controls row;
  - the photo panel guard;
  - the back label;
  - the scroll layout effect;
  - a new `'stats'` render.
- Test: `board-app/src/App.test.jsx`: a new `describe('App (board stats)'`, plus one test in `App (list scroll position)`.

**Interfaces:**
- Consumes:
  - everything from Task 8;
  - `monthOf`, `previousMonth`, `nextMonth`, `monthName` and `localDate` from `../lib/dates`;
  - `formatShortDate` and `sectionHeading` from `../ui`;
  - `openProblem(problemId, from)` in App.
- Produces:
  - `<BoardStatsScreen problems ticks climberCount={number} today={string} onOpenProblem={(id) => void} />`
  - `view === 'stats'`
  - `backTo === 'stats'`, with the back label "Stats"
  - a trophy button with `aria-label="Board stats"`

- [ ] **Step 1: Write the failing tests.** Add this block to `board-app/src/App.test.jsx`, after `describe('App (logbook)'`:

```js
describe('App (board stats)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], rating: 5, created_at: '2026-09-01T12:00:00Z', send_count: 2 },
    { id: 'p2', name: 'Crimpy Corner', grade: 'V3', setter: 'Shawn', notes: '', holds: [], rating: 4, created_at: '2026-09-01T12:00:00Z', send_count: 1 },
    { id: 'p3', name: 'Pinchin', grade: 'V6', setter: 'Rob', notes: '', holds: [], rating: null, created_at: '2026-09-17T12:00:00Z', send_count: 0 },
  ];
  const TICKS = [
    { id: 't1', problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-10-02', created_at: '2026-10-02T18:00:00Z', flash: false },
    { id: 't2', problem_id: 'p1', sent_by: 'Shawn', sent_on: '2026-10-06', created_at: '2026-10-06T18:00:00Z', flash: true },
    { id: 't3', problem_id: 'p2', sent_by: 'Shawn', sent_on: '2026-10-08', created_at: '2026-10-08T18:00:00Z', flash: false },
  ];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 21, 12)); // Wed 21 Oct 2026
    listProblems.mockResolvedValue(PROBLEMS);
    listBoardTicks.mockResolvedValue(TICKS);
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }, { id: 'c2', name: 'Shawn' }]);
  });
  afterEach(() => vi.useRealTimers());

  const openStats = async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Board stats' }));
    return user;
  };

  it("opens from the trophy button with this month's crew board, sorted by new ticks", async () => {
    await openStats();
    expect(screen.getByRole('heading', { name: 'Board stats' })).toBeInTheDocument();
    expect(screen.getByText('3 problems · 2 climbers')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'October crew board' })).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual(['ClimberProblemsNewFlashesTop', 'Shawn221V5', 'Rob110V5']);
    expect(screen.queryByText('No board photo yet')).not.toBeInTheDocument();
  });

  it('shows the latest FAs, classics, popular lately and every open project with how long it has been open', async () => {
    await openStats();
    expect(screen.getByText('Most FAs')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Crimpy Corner.*Shawn · 8 Oct/ })).getByText('V3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Classics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Popular lately' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pinchin.*set by Rob.*open 34 days/ })).toBeInTheDocument();
  });

  it('opens a problem from a row, and Back returns to Stats', async () => {
    const user = await openStats();
    await user.click(screen.getByRole('button', { name: /Pinchin/ }));
    expect(await screen.findByText('Log a send')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /stats/i }));
    expect(screen.getByRole('heading', { name: 'Board stats' })).toBeInTheDocument();
  });

  it("says when nobody has sent anything yet this month, naming last month's top ticker", async () => {
    vi.setSystemTime(new Date(2026, 10, 2, 12)); // 2 Nov
    await openStats();
    expect(screen.getByText('No sends yet in November')).toBeInTheDocument();
    expect(screen.getByText('Last month: Shawn ticked the most new problems (2)')).toBeInTheDocument();
  });
});
```

  Also add this test to `describe('App (list scroll position)'`:

```js
  it('puts you back where you were in board stats when you go back', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Board stats' }));
    await user.click(screen.getByRole('button', { name: /Crimpy Corner/ }));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    window.scrollY = 0;
    await user.click(await screen.findByRole('button', { name: /stats/i }));
    await screen.findByRole('heading', { name: 'Board stats' });
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/App.test.jsx -t "board stats"`
Expected: FAIL, because there's no button named "Board stats".

- [ ] **Step 3: Write `board-app/src/stats/BoardStatsScreen.jsx`**

```jsx
import { useMemo } from 'react';
import {
  crewBoard, latestFAs, faTally, classics, popularLately, openProjects, leastClimbedLately, daysAgoLabel, openLabel,
} from '../lib/boardStats';
import { monthOf, previousMonth, nextMonth, monthName } from '../lib/dates';
import { formatShortDate, sectionHeading } from '../ui';

const mono = "'JetBrains Mono', monospace";
const muted = '#8b8d91';
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cellStyle = { padding: '8px 0', borderTop: '1px solid #2A2B2E', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#c7c8cb' };

function Section({ title, note, children }) {
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <h3 style={{ ...sectionHeading, margin: 0 }}>{title}</h3>
        {note && <span style={{ fontSize: 11.5, color: muted, whiteSpace: 'nowrap' }}>{note}</span>}
      </div>
      <div style={{ background: '#232427', border: '1px solid #2A2B2E', borderRadius: 12, padding: '2px 12px' }}>{children}</div>
    </section>
  );
}

function ProblemRow({ problem, meta, extra, first, onOpen }) {
  return (
    <button onClick={() => onOpen(problem.id)} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none',
      borderTop: first ? 'none' : '1px solid #2A2B2E', color: '#EDEAE3', padding: '10px 0', cursor: 'pointer',
      textAlign: 'left', fontFamily: "'Inter'", fontSize: 13.5,
    }}>
      <span style={{ width: 24, flexShrink: 0, fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#D9552B' }}>{problem.grade || '–'}</span>
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{problem.name}</span>
      {extra}
      {meta && <span style={{ fontSize: 12, color: muted, whiteSpace: 'nowrap' }}>{meta}</span>}
    </button>
  );
}

// The leader in each column is in bold; ties are all bold.
function CrewBoard({ rows }) {
  const best = (key) => Math.max(...rows.map((r) => r[key] ?? -1));
  const leads = { problems: best('problems'), newTicks: best('newTicks'), flashes: best('flashes'), top: best('top') };
  const cell = (row, key, text) => {
    const lead = row[key] !== null && row[key] === leads[key] && (key === 'top' || leads[key] > 0);
    return <td style={{ ...cellStyle, ...(lead && { color: '#EDEAE3', fontWeight: 700 }) }}>{text}</td>;
  };
  const head = { fontSize: 10.5, color: muted, fontWeight: 600, textAlign: 'right', padding: '8px 0 6px' };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          <th style={{ ...head, textAlign: 'left' }}>Climber</th>
          <th style={head}>Problems</th>
          <th style={head}>New</th>
          <th style={head}>Flashes</th>
          <th style={head}>Top</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td style={{ ...cellStyle, textAlign: 'left', color: '#EDEAE3', fontWeight: 600 }}>{row.name}</td>
            {cell(row, 'problems', row.problems)}
            {cell(row, 'newTicks', row.newTicks)}
            {cell(row, 'flashes', row.flashes)}
            {cell(row, 'top', row.top === null ? '–' : `V${row.top}`)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BoardStatsScreen({ problems, ticks, climberCount, today, onOpenProblem }) {
  const month = monthOf(today);
  const stats = useMemo(() => ({
    crew: crewBoard(problems, ticks, month),
    lastMonthTop: crewBoard(problems, ticks, previousMonth(month)).find((r) => r.newTicks > 0) || null,
    fas: latestFAs(problems, ticks),
    tally: faTally(problems, ticks),
    classics: classics(problems, ticks),
    popular: popularLately(problems, ticks, today),
    open: openProjects(problems, ticks, today),
    dusty: leastClimbedLately(problems, ticks, today),
  }), [problems, ticks, month, today]);

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 0.5, margin: 0 }}>Board stats</h2>
      <p style={{ margin: '2px 0 0', fontSize: 13, color: muted }}>
        {`${count(problems.length, 'problem')} · ${count(climberCount, 'climber')}`}
      </p>

      <Section title={`${monthName(month)} crew board`} note={`resets ${formatShortDate(`${nextMonth(month)}-01`)}`}>
        {stats.crew.length > 0 ? <CrewBoard rows={stats.crew} /> : (
          <div style={{ padding: '10px 0', fontSize: 13, color: muted }}>
            <p style={{ margin: 0 }}>{`No sends yet in ${monthName(month)}`}</p>
            {stats.lastMonthTop && (
              <p style={{ margin: '4px 0 0' }}>
                {`Last month: ${stats.lastMonthTop.name} ticked the most new problems (${stats.lastMonthTop.newTicks})`}
              </p>
            )}
          </div>
        )}
      </Section>

      {stats.fas.length > 0 && (
        <Section title="Latest FAs" note="first to send">
          {stats.fas.map((fa, i) => (
            <ProblemRow key={fa.id} problem={fa} first={i === 0} onOpen={onOpenProblem} meta={`${fa.climber} · ${formatShortDate(fa.date)}`} />
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 12.5, color: '#c7c8cb', padding: '9px 0 8px', borderTop: '1px solid #2A2B2E' }}>
            <b style={{ color: '#EDEAE3' }}>Most FAs</b>
            {stats.tally.map((t) => <span key={t.name}>{t.name} <b style={{ color: '#EDEAE3' }}>{t.count}</b></span>)}
          </div>
        </Section>
      )}

      {stats.classics.length > 0 && (
        <Section title="Classics" note="best rated, then most ascents">
          {stats.classics.map((p, i) => (
            <ProblemRow
              key={p.id} problem={p} first={i === 0} onOpen={onOpenProblem} meta={count(p.ascents, 'ascent')}
              extra={<span aria-label={`${p.rating} stars`} style={{ color: '#C9A227', fontSize: 11, letterSpacing: -1, whiteSpace: 'nowrap' }}>{'★'.repeat(p.rating)}</span>}
            />
          ))}
        </Section>
      )}

      {stats.popular.length > 0 && (
        <Section title="Popular lately" note="last 30 days">
          {stats.popular.map((p, i) => (
            <ProblemRow key={p.id} problem={p} first={i === 0} onOpen={onOpenProblem} meta={count(p.climbers, 'climber')} />
          ))}
        </Section>
      )}

      {stats.open.length > 0 && (
        <Section title="No FA yet" note={count(stats.open.length, 'open project')}>
          {stats.open.map((p, i) => (
            <ProblemRow
              key={p.id} problem={p} first={i === 0} onOpen={onOpenProblem}
              meta={[p.setter && `set by ${p.setter}`, p.daysOpen !== null && openLabel(p.daysOpen)].filter(Boolean).join(' · ')}
            />
          ))}
        </Section>
      )}

      {stats.dusty.length > 0 && (
        <Section title="Least climbed lately" note="longest since a send">
          {stats.dusty.map((p, i) => (
            <ProblemRow key={p.id} problem={p} first={i === 0} onOpen={onOpenProblem} meta={daysAgoLabel(p.daysAgo)} />
          ))}
        </Section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into `board-app/src/App.jsx`**

  1. In the lucide import on line 2, add `Trophy` after `CalendarDays,`.
  2. After `import LogbookScreen from './logbook/LogbookScreen';` add:
     ```jsx
     import BoardStatsScreen from './stats/BoardStatsScreen';
     ```
  3. After `const BOARD_OWNER = 'Rob';` add:
     ```jsx
     // The logbook and board stats buttons beside the climber pill.
     const iconButton = {
       display: 'flex', alignItems: 'center', background: 'none', border: '1px solid #3a3b3e',
       color: '#c7c8cb', borderRadius: 20, padding: '5px 8px', cursor: 'pointer',
     };
     ```
  4. In the scroll layout effect, replace `if (view !== 'list' && view !== 'logbook') return;` with:
     ```jsx
         if (view !== 'list' && view !== 'logbook' && view !== 'stats') return;
     ```
  5. Replace the back button label:
     ```jsx
                   <ChevronLeft size={18} /> {view === 'detail' && backTo === 'logbook' ? 'Logbook' : 'Board'}
     ```
     with:
     ```jsx
                   <ChevronLeft size={18} /> {view === 'detail' && backTo === 'logbook' ? 'Logbook' : view === 'detail' && backTo === 'stats' ? 'Stats' : 'Board'}
     ```
  6. Replace the photo panel guard, `{view !== 'logbook' && (`, with:
     ```jsx
             {view !== 'logbook' && view !== 'stats' && (
     ```
  7. In the controls row, replace the right-hand group's opening `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` and the logbook `<button …>…</button>` that follows it, through `<CalendarDays size={14} />` and its closing `</button>`, with:
     ```jsx
                   <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                   <button onClick={() => setView('logbook')} aria-label="Logbook" title="Logbook" style={iconButton}>
                     <CalendarDays size={14} />
                   </button>
                   <button onClick={() => setView('stats')} aria-label="Board stats" title="Board stats" style={iconButton}>
                     <Trophy size={14} />
                   </button>
     ```
     Leave the climber pill button after it unchanged for now (Task 10).
  8. After the `{view === 'logbook' && ( … )}` block, add:
     ```jsx
             {view === 'stats' && (
               <BoardStatsScreen
                 problems={problems}
                 ticks={boardTicks}
                 climberCount={climbers.length}
                 today={localDate()}
                 onOpenProblem={(problemId) => openProblem(problemId, 'stats')}
               />
             )}
     ```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.jsx`
Expected: PASS (every test in the file, including the 5 new ones).

- [ ] **Step 6: Lint, then commit and push**

```bash
npm run lint
git add src/stats/BoardStatsScreen.jsx src/App.jsx src/App.test.jsx
git commit -m "$(printf 'feat: add a board stats screen behind a trophy button\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
git push
```

---

### Task 10: The climber pill shows just your name

**Files:**
- Modify: `board-app/src/App.jsx` (the climber pill button)
- Test: `board-app/src/App.test.jsx` (update `You: …` lookups, and add one test)

**Interfaces:**
- Consumes: nothing new.
- Produces: the climber pill's visible text is the name (`Rob`), or `Who's climbing?` when nobody is picked. When a climber is picked, its accessible name is `Climbing as {name}`.

- [ ] **Step 1: Point the existing tests at the new accessible name**

```bash
sed -i '' \
  -e "s/findByText('You: \([A-Za-z]*\)')/findByRole('button', { name: 'Climbing as \1' })/g" \
  -e "s/getByText('You: \([A-Za-z]*\)')/getByRole('button', { name: 'Climbing as \1' })/g" \
  -e 's/findByText(`You: \${name}`)/findByRole("button", { name: `Climbing as ${name}` })/g' \
  src/App.test.jsx
grep -n "You: " src/App.test.jsx
```

Expected: the `grep` prints nothing.

- [ ] **Step 2: Add a test** at the end of `describe('App (climber picker)'`:

```js
  it('shows just your name on the pill, beside the logbook and board stats buttons', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    render(<App />);
    const pill = await screen.findByRole('button', { name: 'Climbing as Rob' });
    expect(pill.textContent).toBe('Rob');
    expect(screen.getByRole('button', { name: 'Logbook' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Board stats' })).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/App.test.jsx`
Expected: FAIL, because no button is named "Climbing as Rob" yet.

- [ ] **Step 4: Change the pill** in `board-app/src/App.jsx`. Replace the climber pill button:

```jsx
              <button onClick={() => setShowClimberPanel((prev) => !prev)} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                color: '#c7c8cb', borderRadius: 20, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}>
                {currentClimber ? `You: ${currentClimber.name}` : "Who's climbing?"}
              </button>
```

with:

```jsx
              {/* Just the name, cut off with … if it's long, so the pill and
                  both buttons fit on one line on a 360px phone. */}
              <button
                onClick={() => setShowClimberPanel((prev) => !prev)}
                aria-label={currentClimber ? `Climbing as ${currentClimber.name}` : undefined}
                style={{
                  display: 'block', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  background: 'none', border: '1px solid #3a3b3e', color: '#c7c8cb', borderRadius: 20,
                  padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {currentClimber ? currentClimber.name : "Who's climbing?"}
              </button>
```

  Also update the comment above the right-hand group, `{/* Beside the climber, not in the header -- … */}`, to:

```jsx
              {/* Beside the climber, not in the header -- a third header button
                  wraps the title on phones narrower than ~390px. Slim buttons
                  and a name-only pill keep the row on one line at 360px. */}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.jsx`
Expected: PASS. If a test now matches two elements on the text `Rob`, because the open climber panel lists Rob too, scope that query with `within()` to the climber panel. Don't loosen the assertion.

- [ ] **Step 6: Commit and push**

```bash
git add src/App.jsx src/App.test.jsx
git commit -m "$(printf "feat: show just the climber's name so the trophy button fits\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")"
git push
```

---

### Task 11: FA line on the problem page

**Files:**
- Modify: `board-app/src/App.jsx` (imports, a derived `faText`, and the detail header)
- Test: `board-app/src/App.test.jsx` (add to `describe('App (board stats)'`)

**Interfaces:**
- Consumes:
  - `firstAscents` and `repeatsLabel` from `./lib/boardStats` (Task 8);
  - `formatShortDate` from `./ui`;
  - `Trophy` from lucide (already imported in Task 9).
- Produces: a line under "Set by …" on the problem page. It reads "FA Rob · 2 Oct · 1 repeat", or "No FA yet · up for grabs", or is absent.

- [ ] **Step 1: Write the failing tests** at the end of `describe('App (board stats)'`:

```js
  it('shows who got the FA on a problem, with its repeats', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Gaston Traverse'));
    expect(await screen.findByText('FA Rob · 2 Oct · 1 repeat')).toBeInTheDocument();
  });

  it("says a problem nobody has sent is up for grabs", async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Pinchin'));
    expect(await screen.findByText('No FA yet · up for grabs')).toBeInTheDocument();
  });

  it('shows no FA when the first send was logged before climber names', async () => {
    listBoardTicks.mockResolvedValue([
      { id: 't0', problem_id: 'p2', sent_by: null, sent_on: '2026-08-30', created_at: '2026-08-30T18:00:00Z', flash: false },
      ...TICKS,
    ]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Crimpy Corner'));
    await screen.findByText('Log a send');
    expect(screen.queryByText(/^FA /)).not.toBeInTheDocument();
    expect(screen.queryByText(/up for grabs/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/App.test.jsx -t "FA"`
Expected: FAIL, because the FA text isn't found.

- [ ] **Step 3: Implement it** in `board-app/src/App.jsx`

  1. Replace `import { inputStyle, sectionHeading } from './ui';` with:
     ```jsx
     import { inputStyle, sectionHeading, formatShortDate } from './ui';
     import { firstAscents, repeatsLabel } from './lib/boardStats';
     ```
  2. After the line `const faceRows = view === 'new' ? facesOnPhoto(volumes, activePhotoUrl) : [];` add:
     ```jsx
       // The problem page's FA line: who got it, or that it's still up for grabs.
       // Nothing when the first send was logged before climber names existed.
       let faText = null;
       if (view === 'detail' && selected) {
         const fa = firstAscents(problems, boardTicks).get(selected.id);
         if (fa === undefined) faText = 'No FA yet · up for grabs';
         else if (fa) faText = `FA ${fa.climber} · ${formatShortDate(fa.date)} · ${repeatsLabel(fa.repeats)}`;
       }
     ```
  3. In the detail header, directly after
     ```jsx
                     <p style={{ margin: '2px 0 0', fontSize: 13, color: '#8b8d91' }}>{selected.setter ? `Set by ${selected.setter}` : ''}</p>
     ```
     add:
     ```jsx
                     {faText && (
                       <p style={{ margin: '6px 0 0', fontSize: 13, color: '#c7c8cb', display: 'flex', alignItems: 'center', gap: 6 }}>
                         <Trophy size={13} color="#C9A227" aria-hidden="true" />{faText}
                       </p>
                     )}
     ```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.jsx`
Expected: PASS (every test in the file).

- [ ] **Step 5: Commit and push**

```bash
git add src/App.jsx src/App.test.jsx
git commit -m "$(printf 'feat: show the FA on each problem, or that it is up for grabs\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
git push
```

---

### Task 12: Check it on a phone, then open PR 2

**Files:** the same untracked preview files as Task 7.

**Interfaces:**
- Consumes: the finished Part 2.
- Produces: PR 2, `feat/board-stats` → base `feat/logbook-progress`.

- [ ] **Step 1: Run everything**

Run: `npm run lint && npm test && npm run build`
Expected: lint clean, all tests pass, build succeeds.

- [ ] **Step 2: Screenshot in the iOS Simulator.** Run the dev server with `npm run dev -- --host` if it isn't running, then:

```bash
SIM=B388EDD2-1B40-41E0-A5F2-FF368E534B72
xcrun simctl boot $SIM 2>/dev/null; open -a Simulator
for q in "width=360" "open=Board%20stats" "open=Board%20stats&width=360"; do
  xcrun simctl openurl $SIM "http://localhost:5173/preview.html?climber=Shawn&$q"; sleep 6
  xcrun simctl io $SIM screenshot "/private/tmp/claude-501/-Users-roblatticetraining-projects-boardClimbing/997da668-5f4e-4abc-bf50-d32c2ddd25db/scratchpad/sim-stats-$(echo $q | tr '&=%' '___').png"
done
```

  Look at each screenshot and check:
  - at 360px, the controls row (sort, Unsent, logbook, trophy, "Shawn") is on **one line**;
  - every Board stats section matches the mockup: the crew board table fits, and long names cut off with "…".

  Fix anything that's off before carrying on.

- [ ] **Step 3: Open PR 2**

```bash
git push
gh pr create --base feat/logbook-progress --head feat/board-stats --title "Board stats behind a trophy button, and FAs on problems" --body "$(cat <<'EOF'
## What's in it
- **Trophy button** beside the logbook button, opening **Board stats**:
  - **monthly crew board:** Problems · New · Flashes · Top, sorted by new ticks;
  - **latest FAs**, with a Most FAs tally;
  - **Classics:** best rated, then most ascents;
  - **Popular lately:** most different climbers in the last 30 days;
  - **No FA yet:** every open project, with how long it's been open;
  - **Least climbed lately.**
- **Problem pages** show "FA Rob · 20 Oct · 1 repeat", or "No FA yet · up for grabs".
- **The climber pill** shows just the name, so the extra button keeps the row on one line at 360px.

Stacked on #<PR 1 number>. It retargets to `main` once that merges. No database changes.

## Testing
- `npm test`, `npm run lint` and `npm run build` pass.
- New unit tests for every board stat. App tests cover the trophy button, Back to Stats, the empty crew board and the FA line.
- Checked in the iOS Simulator at 393px and in a 360px column.

Spec: `docs/superpowers/specs/2026-10-21-logbook-progress-and-board-stats-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

  Replace `<PR 1 number>` with PR 1's number from `gh pr list`.

- [ ] **Step 4: Hand it to Rob to test** the same way as Task 7, Step 5. Then remove the untracked preview files: `rm preview.html src/preview.jsx`.

# Warm-up Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared warm-up ladder per board — fixed and random rungs — that you run as a checklist logging real sends, finished with a Heavy/Normal/Strong feel rating saved to a session history.

**Architecture:** Pure pick logic in `src/lib/warmup.js`; three thin Supabase functions in `src/lib/board.js`; three new view components in `src/warmup/` that App.jsx switches between via its existing `view` state. The ladder is a jsonb array on `boards.warmup`; sessions are rows in `warmup_sessions`. App keeps owning the board photo — warm-up views tell it which problem's holds to draw via a `warmupFocusId`.

**Tech Stack:** React 19 + Vite, Supabase JS v2, Vitest + Testing Library, lucide-react icons, inline styles.

**Spec:** `docs/superpowers/specs/2026-09-29-warmup-ladder-design.md`

## Global Constraints

- All app code lives in `board-app/`; run commands from `board-app/`.
- **SQL must already be applied** in Supabase before manual testing (see spec "Data"). Tests mock Supabase and don't need it.
- Recency comes from the existing `problems.last_sent_on` column (maintained by the database alongside `send_count`) — **no** extra tick query. This replaces the spec's `listTickDates`.
- Recency weight: `min(daysSinceLastClimbed, 60) + 1`; no date → 61.
- Feel values: `'heavy' | 'normal' | 'strong'`, labels `Heavy / Normal / Strong`.
- Session history shows the latest 10, newest first.
- Error copy pattern: `Could not <action> — check your connection and try again.`
- Colours: bg `#17181A`, card `#232427`, border `#2A2B2E`/`#3a3b3e`, text `#EDEAE3`, muted `#8b8d91`, accent `#D9552B`, sent green `#5C8A66`, link `#C08552`.
- `New problem` keeps its header position and styling; Warm-up sits to its left.
- Commit after each task and push immediately (`git push`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Deleting a problem that's in the ladder** → rung shows "Problem removed", can't be started/ticked, session skips it. (Task 1 `rollLadder` test + Task 3 screen test.)
2. **Two random slots at the same grade with only one problem there** → second slot shows "No V2s on the board" instead of duplicating. (Task 1 test.)
3. **Tick request fails mid-session** → rung stays unsent, error shown, session continues. (Task 5 test.)
4. **Ending with zero sends** → feel prompt still appears; saved session has `sentIds: []`. (Task 5 test.)
5. **Board row with no `warmup` field** (older cached row / tests) → treated as an empty ladder, no crash. (Task 3 test.)

## Execution note (spec deviation)

In the running view the header's back button is hidden and the run component shows its own `End` button next to the `climber · n/total` progress. This keeps the run state inside `WarmupRun` and stops a stray header tap from dropping a session. The spec's `‹ End` in the header becomes this in-panel `End`.

---

### Task 1: Warm-up pick logic

**Files:**
- Create: `board-app/src/lib/warmup.js`
- Test: `board-app/src/lib/warmup.test.js`
- Modify: `docs/superpowers/specs/2026-09-29-warmup-ladder-design.md` (replace `listTickDates` with `last_sent_on`; note in-panel End)

**Interfaces:**
- Produces:
  - `FEELS: {value, label}[]`
  - `todayISO(): 'YYYY-MM-DD'`
  - `recencyWeight(problem, today): number`
  - `rollLadder(rungs, problems, { rng?, today? }): Rolled[]` where `Rolled = { grade: string, random: boolean, problem: Problem|null, status: 'ok'|'unsent-fallback'|'no-problems'|'removed' }` and `rungs = { grade: string, problemId: string|null }[]`
  - `rerollRung(rolled, index, problems, { rng?, today? }): Rolled[]`
  - `canReroll(rolled, index, problems): boolean`
  - `nextUnsentIndex(rolled, sentIds, fromIndex): number` (-1 if none)
  - `sessionPayload(rolled, sentIds): { problemIds: string[], sentIds: string[] }`

- [ ] **Step 1: Write the failing tests**

```js
// board-app/src/lib/warmup.test.js
import { describe, it, expect } from 'vitest';
import { recencyWeight, rollLadder, rerollRung, canReroll, nextUnsentIndex, sessionPayload } from './warmup';

const TODAY = '2026-09-29';
const P = (id, grade, send_count = 1, last_sent_on = '2026-09-01') => ({ id, name: id, grade, send_count, last_sent_on });
// Deterministic rng: returns the given values in turn.
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

describe('recencyWeight', () => {
  it('grows with days since last climbed, capped at 60 days', () => {
    expect(recencyWeight(P('a', 'V2', 1, '2026-09-28'), TODAY)).toBe(2);
    expect(recencyWeight(P('a', 'V2', 1, '2026-09-19'), TODAY)).toBe(11);
    expect(recencyWeight(P('a', 'V2', 1, '2026-01-01'), TODAY)).toBe(61);
  });
  it('treats a problem with no send date as maximally fresh', () => {
    expect(recencyWeight(P('a', 'V2', 0, null), TODAY)).toBe(61);
  });
});

describe('rollLadder', () => {
  it('resolves fixed rungs to their problems', () => {
    const problems = [P('a', 'V1')];
    const rolled = rollLadder([{ grade: 'V1', problemId: 'a' }], problems, { today: TODAY });
    expect(rolled).toEqual([{ grade: 'V1', random: false, problem: problems[0], status: 'ok' }]);
  });

  it('marks a fixed rung whose problem is gone as removed', () => {
    const rolled = rollLadder([{ grade: 'V1', problemId: 'gone' }], [], { today: TODAY });
    expect(rolled[0]).toMatchObject({ problem: null, status: 'removed' });
  });

  it('never picks a problem that is already a fixed rung', () => {
    const problems = [P('a', 'V2'), P('b', 'V2')];
    const rolled = rollLadder(
      [{ grade: 'V2', problemId: null }, { grade: 'V2', problemId: 'a' }],
      problems, { today: TODAY, rng: seq(0) },
    );
    expect(rolled[0].problem.id).toBe('b');
  });

  it('never picks the same problem for two random slots', () => {
    const problems = [P('a', 'V2')];
    const rolled = rollLadder(
      [{ grade: 'V2', problemId: null }, { grade: 'V2', problemId: null }],
      problems, { today: TODAY, rng: seq(0) },
    );
    expect(rolled[0].problem.id).toBe('a');
    expect(rolled[1]).toMatchObject({ problem: null, status: 'no-problems' });
  });

  it('prefers sent problems and only falls back to unsent ones when none are left', () => {
    const problems = [P('unsent', 'V2', 0, null), P('sent', 'V2')];
    const rolled = rollLadder(
      [{ grade: 'V2', problemId: null }, { grade: 'V2', problemId: null }],
      problems, { today: TODAY, rng: seq(0) },
    );
    expect(rolled[0]).toMatchObject({ status: 'ok' });
    expect(rolled[0].problem.id).toBe('sent');
    expect(rolled[1]).toMatchObject({ status: 'unsent-fallback' });
    expect(rolled[1].problem.id).toBe('unsent');
  });

  it('only draws from the exact grade', () => {
    const rolled = rollLadder([{ grade: 'V3', problemId: null }], [P('a', 'V2')], { today: TODAY });
    expect(rolled[0]).toMatchObject({ problem: null, status: 'no-problems' });
  });

  it('weights the pick toward problems not climbed in a while', () => {
    // weights: recent = 2 (yesterday), old = 61 (capped). Total 63.
    const problems = [P('recent', 'V2', 1, '2026-09-28'), P('old', 'V2', 1, '2026-01-01')];
    const rung = [{ grade: 'V2', problemId: null }];
    // rng 0.02 * 63 = 1.26 < 2 -> recent; rng 0.5 -> old.
    expect(rollLadder(rung, problems, { today: TODAY, rng: seq(0.02) })[0].problem.id).toBe('recent');
    expect(rollLadder(rung, problems, { today: TODAY, rng: seq(0.5) })[0].problem.id).toBe('old');
  });
});

describe('rerollRung / canReroll', () => {
  const problems = [P('a', 'V2'), P('b', 'V2'), P('c', 'V3')];

  it('re-picks a random rung, excluding its current pick and the rest of the ladder', () => {
    const rolled = rollLadder(
      [{ grade: 'V2', problemId: null }, { grade: 'V3', problemId: 'c' }],
      problems, { today: TODAY, rng: seq(0) },
    );
    expect(rolled[0].problem.id).toBe('a');
    const rerolled = rerollRung(rolled, 0, problems, { today: TODAY, rng: seq(0) });
    expect(rerolled[0].problem.id).toBe('b');
    expect(rerolled[1]).toBe(rolled[1]);
  });

  it('cannot re-roll when nothing else qualifies, or when the rung is fixed', () => {
    const only = [P('a', 'V2'), P('c', 'V3')];
    const rolled = rollLadder(
      [{ grade: 'V2', problemId: null }, { grade: 'V3', problemId: 'c' }],
      only, { today: TODAY, rng: seq(0) },
    );
    expect(canReroll(rolled, 0, only)).toBe(false);
    expect(canReroll(rolled, 1, only)).toBe(false);
    expect(rerollRung(rolled, 0, only, { today: TODAY })).toBe(rolled);
  });

  it('can re-roll when another problem at the grade is free', () => {
    const rolled = rollLadder([{ grade: 'V2', problemId: null }], problems, { today: TODAY, rng: seq(0) });
    expect(canReroll(rolled, 0, problems)).toBe(true);
  });
});

describe('nextUnsentIndex', () => {
  const rolled = [
    { problem: { id: 'a' } }, { problem: null }, { problem: { id: 'b' } }, { problem: { id: 'c' } },
  ];
  it('finds the next climbable unsent rung after the given index', () => {
    expect(nextUnsentIndex(rolled, [], -1)).toBe(0);
    expect(nextUnsentIndex(rolled, ['a'], 0)).toBe(2);
  });
  it('wraps around to earlier skipped rungs', () => {
    expect(nextUnsentIndex(rolled, ['c'], 3)).toBe(0);
  });
  it('returns -1 when everything climbable is sent', () => {
    expect(nextUnsentIndex(rolled, ['a', 'b', 'c'], 2)).toBe(-1);
  });
});

describe('sessionPayload', () => {
  it('lists climbable rungs in ladder order and the sent subset in the same order', () => {
    const rolled = [{ problem: { id: 'a' } }, { problem: null }, { problem: { id: 'b' } }, { problem: { id: 'c' } }];
    expect(sessionPayload(rolled, ['c', 'a'])).toEqual({ problemIds: ['a', 'b', 'c'], sentIds: ['a', 'c'] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/warmup.test.js`
Expected: FAIL — cannot resolve `./warmup`.

- [ ] **Step 3: Implement**

```js
// board-app/src/lib/warmup.js
export const FEELS = [
  { value: 'heavy', label: 'Heavy' },
  { value: 'normal', label: 'Normal' },
  { value: 'strong', label: 'Strong' },
];

// Past this many days a problem counts as fully "fresh" -- stops something
// untouched for six months from swamping everything else in the pool.
const MAX_AGE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function recencyWeight(problem, today) {
  if (!problem.last_sent_on) return MAX_AGE_DAYS + 1;
  const days = Math.max(0, Math.round((Date.parse(today) - Date.parse(problem.last_sent_on)) / DAY_MS));
  return Math.min(days, MAX_AGE_DAYS) + 1;
}

function pickWeighted(pool, today, rng) {
  const weights = pool.map((p) => recencyWeight(p, today));
  let r = rng() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// Sent problems first (you know they go); unsent only once those run out.
function poolFor(grade, problems, excludeIds) {
  const candidates = problems.filter((p) => p.grade === grade && !excludeIds.has(p.id));
  const sent = candidates.filter((p) => p.send_count > 0);
  if (sent.length) return { pool: sent, status: 'ok' };
  if (candidates.length) return { pool: candidates, status: 'unsent-fallback' };
  return { pool: [], status: 'no-problems' };
}

export function rollLadder(rungs, problems, { rng = Math.random, today = todayISO() } = {}) {
  const byId = new Map(problems.map((p) => [p.id, p]));
  const used = new Set(rungs.filter((r) => r.problemId && byId.has(r.problemId)).map((r) => r.problemId));
  return rungs.map((rung) => {
    if (rung.problemId) {
      const problem = byId.get(rung.problemId) || null;
      return { grade: rung.grade, random: false, problem, status: problem ? 'ok' : 'removed' };
    }
    const { pool, status } = poolFor(rung.grade, problems, used);
    if (!pool.length) return { grade: rung.grade, random: true, problem: null, status };
    const problem = pickWeighted(pool, today, rng);
    used.add(problem.id);
    return { grade: rung.grade, random: true, problem, status };
  });
}

function rerollPool(rolled, index, problems) {
  const entry = rolled[index];
  if (!entry?.random) return { pool: [], status: entry?.status };
  const exclude = new Set(rolled.filter((e) => e.problem).map((e) => e.problem.id));
  return poolFor(entry.grade, problems, exclude);
}

export function canReroll(rolled, index, problems) {
  return rerollPool(rolled, index, problems).pool.length > 0;
}

export function rerollRung(rolled, index, problems, { rng = Math.random, today = todayISO() } = {}) {
  const { pool, status } = rerollPool(rolled, index, problems);
  if (!pool.length) return rolled;
  const problem = pickWeighted(pool, today, rng);
  return rolled.map((e, i) => (i === index ? { ...e, problem, status } : e));
}

export function nextUnsentIndex(rolled, sentIds, fromIndex) {
  const n = rolled.length;
  for (let step = 1; step <= n; step++) {
    const i = (((fromIndex + step) % n) + n) % n;
    const entry = rolled[i];
    if (entry.problem && !sentIds.includes(entry.problem.id)) return i;
  }
  return -1;
}

export function sessionPayload(rolled, sentIds) {
  const problemIds = rolled.filter((e) => e.problem).map((e) => e.problem.id);
  return { problemIds, sentIds: problemIds.filter((id) => sentIds.includes(id)) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/warmup.test.js`
Expected: PASS (all).

- [ ] **Step 5: Update the spec** — in `docs/superpowers/specs/2026-09-29-warmup-ladder-design.md`:
  - In "Random-pick logic", replace the `lastClimbed` parameter description with: "`last_sent_on` on each problem (the database already maintains it alongside `send_count`) is the last-climbed date — no extra query."; change signatures to `rollLadder(rungs, problems, { rng, today })` and `rerollRung(rolled, index, problems, { rng, today })`.
  - In "board.js additions", delete the `listTickDates` bullet.
  - In "Running a session", replace "`‹ End` on the left" with: "the header back button is hidden; the panel shows `climber · n/total` and an `End` button".

- [ ] **Step 6: Commit and push**

```bash
git add src/lib/warmup.js src/lib/warmup.test.js ../docs/superpowers/specs/2026-09-29-warmup-ladder-design.md
git commit -m "feat: add warm-up ladder pick logic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 2: Supabase functions

**Files:**
- Modify: `board-app/src/lib/board.js` (append)
- Test: `board-app/src/lib/board.test.js`
- Modify: `board-app/src/App.test.jsx:5-20` (add new names to the `./lib/board` mock and import; default `listWarmupSessions` to `[]`)

**Interfaces:**
- Produces:
  - `saveWarmup(boardId, rungs) -> Promise<Board>`
  - `listWarmupSessions(boardId) -> Promise<Session[]>` (latest 10, newest first)
  - `createWarmupSession(boardId, { doneOn, climbedBy, feel, problemIds, sentIds }) -> Promise<Session>`
  - `Session = { id, board_id, done_on, climbed_by, feel, problem_ids, sent_ids, created_at }`

- [ ] **Step 1: Write the failing tests** — add the three names to the import list at the top of `board.test.js`, then append:

```js
describe('saveWarmup', () => {
  it('writes the whole ladder to the board and returns the updated board', async () => {
    const rungs = [{ grade: 'V1', problemId: 'p1' }, { grade: 'V2', problemId: null }];
    const updated = { id: 'b1', warmup: rungs };
    const c = chain({ data: updated, error: null });
    mocks.supabase.from.mockReturnValue(c);
    expect(await saveWarmup('b1', rungs)).toEqual(updated);
    expect(mocks.supabase.from).toHaveBeenCalledWith('boards');
    expect(c.update).toHaveBeenCalledWith({ warmup: rungs });
    expect(c.eq).toHaveBeenCalledWith('id', 'b1');
  });

  it('throws when the update fails', async () => {
    mocks.supabase.from.mockReturnValue(chain({ data: null, error: new Error('nope') }));
    await expect(saveWarmup('b1', [])).rejects.toThrow('nope');
  });
});

describe('listWarmupSessions', () => {
  it('lists the latest 10 sessions for the board, newest first', async () => {
    const sessions = [{ id: 's1' }];
    const c = chain({ data: sessions, error: null });
    mocks.supabase.from.mockReturnValue(c);
    expect(await listWarmupSessions('b1')).toEqual(sessions);
    expect(mocks.supabase.from).toHaveBeenCalledWith('warmup_sessions');
    expect(c.eq).toHaveBeenCalledWith('board_id', 'b1');
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(c.limit).toHaveBeenCalledWith(10);
  });
});

describe('createWarmupSession', () => {
  it('inserts a session row with snake_case columns', async () => {
    const created = { id: 's1' };
    const c = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await createWarmupSession('b1', {
      doneOn: '2026-09-29', climbedBy: 'Rob', feel: 'strong', problemIds: ['a', 'b'], sentIds: ['a'],
    });
    expect(result).toEqual(created);
    expect(mocks.supabase.from).toHaveBeenCalledWith('warmup_sessions');
    expect(c.insert).toHaveBeenCalledWith({
      board_id: 'b1', done_on: '2026-09-29', climbed_by: 'Rob', feel: 'strong', problem_ids: ['a', 'b'], sent_ids: ['a'],
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/board.test.js`
Expected: FAIL — `saveWarmup is not a function` (or similar).

- [ ] **Step 3: Implement** — append to `board.js`:

```js
export async function saveWarmup(boardId, rungs) {
  const { data, error } = await supabase
    .from('boards')
    .update({ warmup: rungs })
    .eq('id', boardId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listWarmupSessions(boardId) {
  const { data, error } = await supabase
    .from('warmup_sessions')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}

export async function createWarmupSession(boardId, { doneOn, climbedBy, feel, problemIds, sentIds }) {
  const { data, error } = await supabase
    .from('warmup_sessions')
    .insert({ board_id: boardId, done_on: doneOn, climbed_by: climbedBy, feel, problem_ids: problemIds, sent_ids: sentIds })
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Update the App test mock** — in `App.test.jsx`, add `saveWarmup: vi.fn(), listWarmupSessions: vi.fn(), createWarmupSession: vi.fn(),` to the `vi.mock('./lib/board', ...)` object, add the same three names to the `import { ... } from './lib/board'` line, and in `beforeEach` add `listWarmupSessions.mockResolvedValue([]);`.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS (all).

- [ ] **Step 6: Commit and push**

```bash
git add src/lib/board.js src/lib/board.test.js src/App.test.jsx
git commit -m "feat: add Supabase calls for the warm-up ladder and sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Header button + Warm-up screen

**Files:**
- Create: `board-app/src/ui.js` (shared styles + `formatShortDate`; kept out of component files so oxlint's `only-export-components` stays quiet)
- Create: `board-app/src/warmup/WarmupScreen.jsx`
- Modify: `board-app/src/App.jsx` (imports, `inputStyle` moved to `ui.js`, new state, header, photo focus, sessions effect, render)
- Test: `board-app/src/App.test.jsx` (new `describe('App (warm-up screen)')`)

**Interfaces:**
- Consumes: `listWarmupSessions`, `FEELS`
- Produces:
  - `ui.js`: `inputStyle`, `gradeBadgeStyle`, `sectionHeading`, `linkButton` (objects); `primaryButton(enabled)`, `rungRow(active, muted)` (style factories); `formatShortDate(dateStr): string` (`'27 Sep'`)
  - `<WarmupScreen rungs problems sessions climber onFocus(problemId|null) onEdit() onStart() />`
  - App state `warmupFocusId`, `warmupSessions`; views `'warmup' | 'warmup-edit' | 'warmup-run'`

- [ ] **Step 1: Write the failing tests** — append to `App.test.jsx`:

```js
describe('App (warm-up screen)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Jug Haul', grade: 'V1', setter: 'Rob', notes: '', holds: [{ x: 0.2, y: 0.3, type: 'start' }], send_count: 2, last_sent_on: '2026-09-01' },
    { id: 'p2', name: 'Crimp City', grade: 'V3', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-09-10' },
  ];

  it('opens from the header and shows the empty state when there is no ladder', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    expect(await screen.findByText('No warm-up yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build your ladder' })).toBeInTheDocument();
    expect(listWarmupSessions).toHaveBeenCalledWith('b1');
  });

  it('keeps New problem in the header alongside Warm-up', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: /new problem/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /warm-up/i })).toBeInTheDocument();
  });

  it('lists fixed, random and removed rungs, plus past sessions', async () => {
    getOrCreateBoard.mockResolvedValue({
      ...BOARD,
      warmup: [{ grade: 'V1', problemId: 'p1' }, { grade: 'V2', problemId: null }, { grade: 'V3', problemId: 'deleted' }],
    });
    listProblems.mockResolvedValue(PROBLEMS);
    listWarmupSessions.mockResolvedValue([
      { id: 's1', done_on: '2026-09-27', climbed_by: 'Rob', feel: 'strong', problem_ids: ['p1', 'p2'], sent_ids: ['p1', 'p2'] },
    ]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    expect(await screen.findByText('Jug Haul')).toBeInTheDocument();
    expect(screen.getByText('random V2')).toBeInTheDocument();
    expect(screen.getByText('Problem removed')).toBeInTheDocument();
    expect(await screen.findByText(/27 Sep · Rob · Strong · 2\/2/)).toBeInTheDocument();
  });

  it('disables Start until a climber is selected', async () => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup: [{ grade: 'V1', problemId: 'p1' }] });
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    expect(await screen.findByRole('button', { name: 'Select who you are first' })).toBeDisabled();
  });

  it('enables Start when a climber is selected', async () => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup: [{ grade: 'V1', problemId: 'p1' }] });
    listProblems.mockResolvedValue(PROBLEMS);
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    localStorage.setItem('board-app:currentClimberId', 'c1');
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    expect(await screen.findByRole('button', { name: 'Start warm-up' })).toBeEnabled();
  });

  it('goes back to the list from the header', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: /board/i }));
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
  });
});
```

The key `'board-app:currentClimberId'` is the one `src/lib/climberStorage.js` uses.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/App.test.jsx`
Expected: the new warm-up tests FAIL (no Warm-up button).

- [ ] **Step 3: Create `src/ui.js`** and move `inputStyle` out of App.jsx:

```js
// board-app/src/ui.js
export const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: '#232427', border: '1px solid #3a3b3e',
  borderRadius: 8, padding: '10px 12px', color: '#EDEAE3', fontSize: 14.5, fontFamily: "'Inter'", marginTop: 4,
};

export const gradeBadgeStyle = {
  fontFamily: "'JetBrains Mono', monospace", background: '#17181A', border: '1px solid #3a3b3e',
  color: '#D9552B', fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
};

export function formatShortDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const sectionHeading = { fontSize: 12, color: '#8b8d91', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 8px' };

export const linkButton = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#C08552', fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 };

export function primaryButton(enabled) {
  return {
    background: enabled ? '#D9552B' : '#3a3b3e', color: '#17181A', border: 'none', borderRadius: 8,
    padding: '11px 16px', fontWeight: 700, fontSize: 14.5, cursor: enabled ? 'pointer' : 'not-allowed',
  };
}

export function rungRow(active, muted) {
  return {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: active ? '#2b2c30' : '#232427',
    border: `1px solid ${active ? '#D9552B' : '#2A2B2E'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8,
    color: muted ? '#6d6f73' : '#EDEAE3', fontSize: 14.5, cursor: 'pointer', fontFamily: "'Inter'",
  };
}
```

In `App.jsx`, delete the local `const inputStyle = {...}` and add `import { inputStyle } from './ui';`.

- [ ] **Step 4: Create `src/warmup/WarmupScreen.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { Pencil, RefreshCw } from 'lucide-react';
import { FEELS } from '../lib/warmup';
import { formatShortDate, gradeBadgeStyle, sectionHeading, linkButton, primaryButton, rungRow } from '../ui';

const FEEL_LABELS = Object.fromEntries(FEELS.map((f) => [f.value, f.label]));

export default function WarmupScreen({ rungs, problems, sessions, climber, onFocus, onEdit, onStart }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const byId = new Map(problems.map((p) => [p.id, p]));
  const focusedId = rungs[selectedIndex]?.problemId;
  const focusedProblemId = focusedId && byId.has(focusedId) ? focusedId : null;

  useEffect(() => { onFocus(focusedProblemId); }, [focusedProblemId, onFocus]);

  if (rungs.length === 0) {
    return (
      <div style={{ marginTop: 22, textAlign: 'center', padding: '20px 10px', color: '#8b8d91' }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#EDEAE3', margin: '0 0 6px' }}>No warm-up yet</p>
        <p style={{ fontSize: 13.5, margin: '0 0 14px' }}>Pick the problems you like to warm up on, and add random slots for variety.</p>
        <button onClick={onEdit} style={primaryButton(true)}>Build your ladder</button>
      </div>
    );
  }

  const canStart = Boolean(climber);
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={sectionHeading}>Warm-up ladder · {rungs.length} rungs</h2>
        <button onClick={onEdit} style={linkButton}><Pencil size={14} /> Edit</button>
      </div>
      {rungs.map((rung, i) => {
        const problem = rung.problemId ? byId.get(rung.problemId) : null;
        const removed = rung.problemId && !problem;
        return (
          <button key={i} onClick={() => setSelectedIndex(i)} style={rungRow(i === selectedIndex, removed)}>
            <span style={{ color: '#8b8d91', width: 18 }}>{i + 1}</span>
            <span style={gradeBadgeStyle}>{rung.grade}</span>
            <span style={{ flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
              {!rung.problemId && <><RefreshCw size={13} /><span>random {rung.grade}</span></>}
              {problem && problem.name}
              {removed && 'Problem removed'}
            </span>
          </button>
        );
      })}
      <button onClick={onStart} disabled={!canStart} style={{ ...primaryButton(canStart), width: '100%', marginTop: 8 }}>
        {canStart ? 'Start warm-up' : 'Select who you are first'}
      </button>

      {sessions.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <h2 style={sectionHeading}>Last sessions</h2>
          {sessions.map((s) => (
            <div key={s.id} style={{ fontSize: 13.5, color: '#c7c8cb', padding: '6px 0', borderBottom: '1px solid #2A2B2E' }}>
              {[formatShortDate(s.done_on), s.climbed_by, FEEL_LABELS[s.feel], `${s.sent_ids.length}/${s.problem_ids.length}`].filter(Boolean).join(' · ')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

```

- [ ] **Step 5: Wire into `App.jsx`**

1. Imports: add `Flame` to the lucide import; add `listWarmupSessions` to the `./lib/board` import; add `import WarmupScreen from './warmup/WarmupScreen';`.
2. State (next to `sort`): 
   ```js
   const [warmupFocusId, setWarmupFocusId] = useState(null);
   const [warmupSessions, setWarmupSessions] = useState([]);
   ```
3. Sessions effect (after the ticks effect):
   ```js
   useEffect(() => {
     if (view !== 'warmup' || !board) return;
     (async () => {
       try {
         setWarmupSessions(await listWarmupSessions(board.id));
       } catch (err) {
         console.error(err);
         setError('Could not load past warm-ups — check your connection and try again.');
       }
     })();
   }, [view, board]);
   ```
4. Derived values — replace the `displayHolds` / `lockedProblem` lines:
   ```js
   const isWarmupView = view.startsWith('warmup');
   const warmupRungs = board?.warmup || [];
   const warmupFocus = isWarmupView && warmupFocusId ? problems.find((p) => p.id === warmupFocusId) || null : null;
   const lockedProblem = view === 'detail' ? selected : warmupFocus;
   const displayHolds = view === 'new' ? draftHolds : (lockedProblem ? lockedProblem.holds : []);
   ```
   (Keep the existing `displayPhotoUrl`, `lockedMaskUrl`, `detailPhotoStatus` lines after these. Check that `detailPhotoStatus` is only rendered inside the `view === 'detail'` block; if it's rendered elsewhere, guard it with `view === 'detail'`.)
5. Header — wrap the existing New problem button so Warm-up sits to its left, and add a CSS rule to hide the label on narrow screens. Change `fontImport` to also contain:
   ```css
   @media (max-width: 380px) { .warmup-label { display: none; } }
   ```
   and replace the `{view === 'list' && ( <button onClick={startNewProblem} ... )}` block with:
   ```jsx
   {view === 'list' && (
     <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
       <button onClick={() => { setWarmupFocusId(null); setView('warmup'); }} aria-label="Warm-up" style={{
         display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#EDEAE3',
         border: '1px solid #3a3b3e', borderRadius: 8, padding: '8px 12px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
       }}>
         <Flame size={16} /> <span className="warmup-label">Warm-up</span>
       </button>
       {/* existing New problem button, unchanged */}
     </div>
   )}
   ```
   Hide the header's `‹ Board` back button when `view === 'warmup-run'`: change the header's left side to render `THE BOARD` when `view === 'list'`, `WARM-UP` (same h1 style) when `view === 'warmup-run'`, and the back button otherwise.
6. Render, after the `view === 'detail'` block:
   ```jsx
   {view === 'warmup' && (
     <WarmupScreen
       rungs={warmupRungs}
       problems={problems}
       sessions={warmupSessions}
       climber={currentClimber}
       onFocus={setWarmupFocusId}
       onEdit={() => { setWarmupFocusId(null); setView('warmup-edit'); }}
       onStart={() => setView('warmup-run')}
     />
   )}
   ```

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS. If an older test finds the header buttons by index or text that now also matches "Warm-up", tighten that test's query rather than changing behaviour.

- [ ] **Step 7: Lint, commit and push**

```bash
npm run lint
git add src/ui.js src/warmup/WarmupScreen.jsx src/App.jsx src/App.test.jsx
git commit -m "feat: add the warm-up screen, reachable from the header

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 4: Ladder editor

**Files:**
- Create: `board-app/src/warmup/WarmupEditor.jsx`
- Modify: `board-app/src/App.jsx` (import `saveWarmup`, handler, render)
- Test: `board-app/src/App.test.jsx` (new `describe('App (warm-up editor)')`)

**Interfaces:**
- Consumes: `saveWarmup(boardId, rungs)`, `sortAndFilterProblems`, `GRADES`, `inputStyle`, `gradeBadgeStyle`, `sectionHeading`, `linkButton`, `primaryButton`, `rungRow` (from `ui.js`)
- Produces: `<WarmupEditor initialRungs problems saving onSave(rungs) onCancel() />`

- [ ] **Step 1: Write the failing tests**

```js
describe('App (warm-up editor)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Jug Haul', grade: 'V1', setter: 'Rob', notes: '', holds: [], send_count: 2 },
    { id: 'p2', name: 'Crimp City', grade: 'V3', setter: 'Rob', notes: '', holds: [], send_count: 1 },
  ];

  const openEditor = async (user) => {
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: 'Build your ladder' }));
  };

  it('builds a ladder of fixed and random rungs and saves it in order', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    saveWarmup.mockImplementation(async (id, rungs) => ({ ...BOARD, warmup: rungs }));
    render(<App />);
    const user = userEvent.setup();
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: '+ Add a problem' }));
    await user.click(screen.getByRole('button', { name: /Jug Haul/ }));
    await user.click(screen.getByRole('button', { name: '+ Add random slot' }));
    await user.click(screen.getByRole('button', { name: 'V2' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(saveWarmup).toHaveBeenCalledWith('b1', [
      { grade: 'V1', problemId: 'p1' },
      { grade: 'V2', problemId: null },
    ]));
    expect(await screen.findByText('random V2')).toBeInTheDocument();
  });

  it('reorders and removes rungs', async () => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup: [{ grade: 'V1', problemId: 'p1' }, { grade: 'V3', problemId: 'p2' }, { grade: 'V2', problemId: null }] });
    listProblems.mockResolvedValue(PROBLEMS);
    saveWarmup.mockImplementation(async (id, rungs) => ({ ...BOARD, warmup: rungs }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: /edit/i }));

    await user.click(screen.getByRole('button', { name: 'Move rung 3 up' }));
    await user.click(screen.getByRole('button', { name: 'Remove rung 1' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(saveWarmup).toHaveBeenCalledWith('b1', [
      { grade: 'V2', problemId: null },
      { grade: 'V3', problemId: 'p2' },
    ]));
  });

  it('changes a fixed rung into a random slot at the same grade', async () => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup: [{ grade: 'V1', problemId: 'p1' }] });
    listProblems.mockResolvedValue(PROBLEMS);
    saveWarmup.mockImplementation(async (id, rungs) => ({ ...BOARD, warmup: rungs }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: /edit/i }));

    await user.click(screen.getByRole('button', { name: 'Change rung 1' }));
    await user.click(screen.getByRole('button', { name: 'Make this a random V1' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(saveWarmup).toHaveBeenCalledWith('b1', [{ grade: 'V1', problemId: null }]));
  });

  it('filters the problem picker by name', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await openEditor(user);
    await user.click(screen.getByRole('button', { name: '+ Add a problem' }));
    await user.type(screen.getByRole('textbox', { name: 'Search problems' }), 'crimp');
    expect(screen.getByRole('button', { name: /Crimp City/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Jug Haul/ })).not.toBeInTheDocument();
  });

  it('stays in the editor and shows an error when saving fails', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    saveWarmup.mockRejectedValue(new Error('offline'));
    render(<App />);
    const user = userEvent.setup();
    await openEditor(user);
    await user.click(screen.getByRole('button', { name: '+ Add random slot' }));
    await user.click(screen.getByRole('button', { name: 'V2' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText(/could not save the warm-up/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/App.test.jsx`
Expected: editor tests FAIL.

- [ ] **Step 3: Create `src/warmup/WarmupEditor.jsx`**

```jsx
import { useState } from 'react';
import { ChevronUp, ChevronDown, X, RefreshCw } from 'lucide-react';
import { GRADES } from '../lib/grades';
import { sortAndFilterProblems } from '../lib/problemList';
import { inputStyle, gradeBadgeStyle, sectionHeading, linkButton, primaryButton, rungRow } from '../ui';

// picker: null | { mode: 'problem', index: number|null } | { mode: 'grade' }
// index null = append a new rung; a number = replace that rung.
export default function WarmupEditor({ initialRungs, problems, saving, onSave, onCancel }) {
  const [rungs, setRungs] = useState(initialRungs);
  const [picker, setPicker] = useState(null);
  const [search, setSearch] = useState('');
  const byId = new Map(problems.map((p) => [p.id, p]));

  const move = (i, delta) => setRungs((prev) => {
    const next = [...prev];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    return next;
  });
  const remove = (i) => setRungs((prev) => prev.filter((_, j) => j !== i));
  const place = (index, rung) => {
    setRungs((prev) => (index === null ? [...prev, rung] : prev.map((r, j) => (j === index ? rung : r))));
    setPicker(null);
    setSearch('');
  };

  const pickable = sortAndFilterProblems(problems, { sort: 'grade-asc' })
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={sectionHeading}>Edit ladder</h2>
        <button onClick={() => onSave(rungs)} disabled={saving} style={primaryButton(!saving)}>Done</button>
      </div>

      {rungs.map((rung, i) => {
        const problem = rung.problemId ? byId.get(rung.problemId) : null;
        const n = i + 1;
        return (
          <div key={i} style={{ ...rungRow(false, rung.problemId && !problem), cursor: 'default' }}>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <button aria-label={`Move rung ${n} up`} disabled={i === 0} onClick={() => move(i, -1)} style={iconButton}><ChevronUp size={14} /></button>
              <button aria-label={`Move rung ${n} down`} disabled={i === rungs.length - 1} onClick={() => move(i, 1)} style={iconButton}><ChevronDown size={14} /></button>
            </span>
            <span style={gradeBadgeStyle}>{rung.grade}</span>
            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              {!rung.problemId && <><RefreshCw size={13} /> random</>}
              {problem && problem.name}
              {rung.problemId && !problem && 'Problem removed'}
            </span>
            <button aria-label={`Change rung ${n}`} onClick={() => setPicker({ mode: 'problem', index: i })} style={linkButton}>Change</button>
            <button aria-label={`Remove rung ${n}`} onClick={() => remove(i)} style={iconButton}><X size={16} /></button>
          </div>
        );
      })}

      {!picker && (
        <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
          <button onClick={() => setPicker({ mode: 'problem', index: null })} style={linkButton}>+ Add a problem</button>
          <button onClick={() => setPicker({ mode: 'grade' })} style={linkButton}>+ Add random slot</button>
        </div>
      )}

      {picker?.mode === 'grade' && (
        <div style={{ marginTop: 10 }}>
          <h2 style={sectionHeading}>Random slot grade</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {GRADES.map((g) => (
              <button key={g} onClick={() => place(null, { grade: g, problemId: null })} style={{ ...gradeBadgeStyle, cursor: 'pointer' }}>{g}</button>
            ))}
          </div>
          <button onClick={() => setPicker(null)} style={{ ...linkButton, marginTop: 10 }}>Cancel</button>
        </div>
      )}

      {picker?.mode === 'problem' && (
        <div style={{ marginTop: 10 }}>
          <input aria-label="Search problems" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search problems" style={inputStyle} />
          {picker.index !== null && (
            <button
              onClick={() => place(picker.index, { grade: rungs[picker.index].grade, problemId: null })}
              style={{ ...linkButton, margin: '10px 0' }}
            >{`Make this a random ${rungs[picker.index].grade}`}</button>
          )}
          <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 8 }}>
            {pickable.map((p) => (
              <button key={p.id} disabled={!p.grade} onClick={() => place(picker.index, { grade: p.grade, problemId: p.id })} style={rungRow(false, !p.grade)}>
                <span style={gradeBadgeStyle}>{p.grade || '—'}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{p.name}</span>
              </button>
            ))}
          </div>
          <button onClick={() => { setPicker(null); setSearch(''); }} style={{ ...linkButton, marginTop: 10 }}>Cancel</button>
        </div>
      )}

      <button onClick={onCancel} style={{ ...linkButton, marginTop: 18, color: '#8b8d91' }}>Discard changes</button>
    </div>
  );
}

const iconButton = { background: 'none', border: 'none', color: '#8b8d91', cursor: 'pointer', padding: 2, display: 'flex' };
```

Ungraded problems are shown but disabled in the picker — a rung needs a grade.

- [ ] **Step 4: Wire into `App.jsx`**

1. Add `saveWarmup` to the `./lib/board` import; `import WarmupEditor from './warmup/WarmupEditor';`.
2. State: `const [savingWarmup, setSavingWarmup] = useState(false);`
3. Handler:
   ```js
   const handleSaveWarmup = async (rungs) => {
     setSavingWarmup(true);
     setError('');
     try {
       const updated = await saveWarmup(board.id, rungs);
       setBoard(updated);
       setView('warmup');
     } catch (err) {
       console.error(err);
       setError('Could not save the warm-up — check your connection and try again.');
     }
     setSavingWarmup(false);
   };
   ```
4. Render after the `WarmupScreen` block:
   ```jsx
   {view === 'warmup-edit' && (
     <WarmupEditor
       initialRungs={warmupRungs}
       problems={problems}
       saving={savingWarmup}
       onSave={handleSaveWarmup}
       onCancel={() => setView('warmup')}
     />
   )}
   ```

- [ ] **Step 5: Run the full suite** — `npx vitest run` → PASS.

- [ ] **Step 6: Lint, commit and push**

```bash
npm run lint
git add src/warmup/WarmupEditor.jsx src/App.jsx src/App.test.jsx
git commit -m "feat: build and edit the warm-up ladder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 5: Running a session

**Files:**
- Create: `board-app/src/warmup/WarmupRun.jsx`
- Modify: `board-app/src/lib/problemList.js` (add `applySend`), `board-app/src/lib/problemList.test.js`
- Modify: `board-app/src/App.jsx` (reuse `applySend` in `handleAddTick`; run handlers; render)
- Test: `board-app/src/App.test.jsx` (new `describe('App (warm-up session)')`)

**Interfaces:**
- Consumes: `rollLadder`, `rerollRung`, `canReroll`, `nextUnsentIndex`, `sessionPayload`, `FEELS`, `todayISO`, `createTick`, `createWarmupSession`
- Produces:
  - `applySend(problems, problemId, sentOn): Problem[]`
  - `<WarmupRun rungs problems climberName onFocus(problemId|null) onSend(problemId) => Promise<boolean> onFinish({feel, problemIds, sentIds}) => Promise<boolean> onDiscard() />`

- [ ] **Step 1: Write the failing `applySend` test** — append to `problemList.test.js` (and import `applySend`):

```js
describe('applySend', () => {
  it('bumps send_count and keeps the latest last_sent_on for that problem only', () => {
    const list = [
      { id: 'a', send_count: 1, last_sent_on: '2026-09-20' },
      { id: 'b', send_count: 0, last_sent_on: null },
    ];
    expect(applySend(list, 'a', '2026-09-29')).toEqual([
      { id: 'a', send_count: 2, last_sent_on: '2026-09-29' },
      { id: 'b', send_count: 0, last_sent_on: null },
    ]);
    expect(applySend(list, 'a', '2026-09-01')[0].last_sent_on).toBe('2026-09-20');
    expect(applySend(list, 'b', '2026-09-29')[1]).toEqual({ id: 'b', send_count: 1, last_sent_on: '2026-09-29' });
  });
});
```

- [ ] **Step 2: Implement `applySend`** in `problemList.js`:

```js
// Mirrors what the database does to a problem when a tick is inserted, so the
// list stays right without a refetch.
export function applySend(problems, problemId, sentOn) {
  return problems.map((p) => (p.id === problemId ? {
    ...p,
    send_count: (p.send_count || 0) + 1,
    last_sent_on: p.last_sent_on && p.last_sent_on > sentOn ? p.last_sent_on : sentOn,
  } : p));
}
```

Then in `App.jsx` `handleAddTick`, replace the inline `setProblems((prev) => prev.map(...))` with `setProblems((prev) => applySend(prev, problemId, created.sent_on));` and import `applySend` alongside `sortAndFilterProblems`.

Run: `npx vitest run` → PASS (existing tick tests prove the refactor).

- [ ] **Step 3: Write the failing session tests** — append to `App.test.jsx`:

```js
describe('App (warm-up session)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Jug Haul', grade: 'V1', setter: 'Rob', notes: '', holds: [], send_count: 2, last_sent_on: '2026-09-01' },
    { id: 'p2', name: 'Pinch Party', grade: 'V2', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-08-01' },
    { id: 'p3', name: 'Slab Dance', grade: 'V2', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-08-01' },
  ];

  const CLIMBER_KEY = 'board-app:currentClimberId';

  const startSession = async (warmup) => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup });
    listProblems.mockResolvedValue(PROBLEMS);
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    localStorage.setItem(CLIMBER_KEY, 'c1');
    createTick.mockImplementation(async (problemId, { sentOn }) => ({ id: `t-${problemId}`, problem_id: problemId, sent_on: sentOn }));
    // Model the table: the Warm-up screen refetches sessions when it reopens.
    const saved = [];
    createWarmupSession.mockImplementation(async (boardId, s) => {
      const row = { id: `s${saved.length + 1}`, done_on: s.doneOn, climbed_by: s.climbedBy, feel: s.feel, problem_ids: s.problemIds, sent_ids: s.sentIds };
      saved.unshift(row);
      return row;
    });
    listWarmupSessions.mockImplementation(async () => [...saved]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: 'Start warm-up' }));
    return user;
  };

  it('logs a normal send for the current rung and moves to the next', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }, { grade: 'V2', problemId: 'p2' }]);
    expect(screen.getByText('Rob · 0/2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sent Jug Haul' }));
    expect(createTick).toHaveBeenCalledWith('p1', expect.objectContaining({ sentBy: 'Rob', notes: '' }));
    expect(await screen.findByText('Rob · 1/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sent Pinch Party' })).toBeInTheDocument();
  });

  it('asks for a feel when the last rung is sent and saves the session', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }]);
    await user.click(screen.getByRole('button', { name: 'Sent Jug Haul' }));
    await user.click(await screen.findByRole('button', { name: 'Strong' }));
    await waitFor(() => expect(createWarmupSession).toHaveBeenCalledWith('b1', expect.objectContaining({
      climbedBy: 'Rob', feel: 'strong', problemIds: ['p1'], sentIds: ['p1'],
    })));
    expect(await screen.findByText(/Rob · Strong · 1\/1/)).toBeInTheDocument();
  });

  it('ending part-way still asks for a feel and saves partial progress', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }, { grade: 'V2', problemId: 'p2' }]);
    await user.click(screen.getByRole('button', { name: 'End' }));
    await user.click(await screen.findByRole('button', { name: 'Heavy' }));
    await waitFor(() => expect(createWarmupSession).toHaveBeenCalledWith('b1', expect.objectContaining({
      feel: 'heavy', problemIds: ['p1', 'p2'], sentIds: [],
    })));
  });

  it('discarding saves no session', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }]);
    await user.click(screen.getByRole('button', { name: 'End' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(createWarmupSession).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Start warm-up' })).toBeInTheDocument();
  });

  it('re-rolls a random rung to another problem at that grade', async () => {
    const user = await startSession([{ grade: 'V2', problemId: null }]);
    const before = screen.getByText(/Pinch Party|Slab Dance/).textContent;
    await user.click(screen.getByRole('button', { name: 'Re-roll rung 1' }));
    const after = screen.getByText(/Pinch Party|Slab Dance/).textContent;
    expect(after).not.toBe(before);
  });

  it('keeps the rung unsent and shows an error when the send fails', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }]);
    createTick.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Sent Jug Haul' }));
    expect(await screen.findByText(/could not log that send/i)).toBeInTheDocument();
    expect(screen.getByText('Rob · 0/1')).toBeInTheDocument();
  });

  it('skips removed rungs', async () => {
    await startSession([{ grade: 'V1', problemId: 'gone' }, { grade: 'V1', problemId: 'p1' }]);
    expect(screen.getByText('Rob · 0/1')).toBeInTheDocument();
    expect(screen.getByText('Problem removed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sent Jug Haul' })).toBeInTheDocument();
  });
});
```

`CLIMBER_KEY` is defined at the top of this describe.

- [ ] **Step 4: Run to verify failure** — `npx vitest run src/App.test.jsx` → session tests FAIL.

- [ ] **Step 5: Create `src/warmup/WarmupRun.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Play, RefreshCw } from 'lucide-react';
import { FEELS, rollLadder, rerollRung, canReroll, nextUnsentIndex, sessionPayload } from '../lib/warmup';
import { gradeBadgeStyle, sectionHeading, linkButton, primaryButton, rungRow } from '../ui';

const SKIP_LABELS = { removed: 'Problem removed' };

export default function WarmupRun({ rungs, problems, climberName, onFocus, onSend, onFinish, onDiscard }) {
  const [rolled, setRolled] = useState(() => rollLadder(rungs, problems));
  const [sentIds, setSentIds] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(() => nextUnsentIndex(rolled, [], -1));
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(currentIndex === -1);
  const [savingSession, setSavingSession] = useState(false);

  const climbable = rolled.filter((e) => e.problem).length;
  const current = rolled[currentIndex];
  const currentProblemId = current?.problem?.id ?? null;

  useEffect(() => { onFocus(currentProblemId); }, [currentProblemId, onFocus]);

  const handleSend = async () => {
    if (!current?.problem) return;
    setSending(true);
    const ok = await onSend(current.problem.id);
    setSending(false);
    if (!ok) return;
    const nextSent = [...sentIds, current.problem.id];
    setSentIds(nextSent);
    const next = nextUnsentIndex(rolled, nextSent, currentIndex);
    if (next === -1) setFinishing(true);
    else setCurrentIndex(next);
  };

  const handleFeel = async (feel) => {
    setSavingSession(true);
    const ok = await onFinish({ feel, ...sessionPayload(rolled, sentIds) });
    if (!ok) setSavingSession(false);
  };

  const hasUnsent = nextUnsentIndex(rolled, sentIds, -1) !== -1;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{`${climberName} · ${sentIds.length}/${climbable}`}</span>
        {!finishing && <button onClick={() => setFinishing(true)} style={linkButton}>End</button>}
      </div>

      {finishing && (
        <div style={{ background: '#232427', border: '1px solid #3a3b3e', borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{`Warm-up done · ${sentIds.length} / ${climbable}`}</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: '#8b8d91' }}>How did it feel?</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {FEELS.map((f) => (
              <button key={f.value} disabled={savingSession} onClick={() => handleFeel(f.value)} style={{ ...primaryButton(!savingSession), flex: 1 }}>{f.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            {hasUnsent && <button onClick={() => setFinishing(false)} style={linkButton}>Keep going</button>}
            <button onClick={onDiscard} style={{ ...linkButton, color: '#8b8d91' }}>Discard</button>
          </div>
        </div>
      )}

      <h2 style={sectionHeading}>Ladder</h2>
      {rolled.map((entry, i) => {
        const n = i + 1;
        const sent = entry.problem && sentIds.includes(entry.problem.id);
        const isCurrent = i === currentIndex && !finishing;
        const skipped = !entry.problem;
        const label = entry.problem
          ? entry.problem.name
          : SKIP_LABELS[entry.status] || `No ${entry.grade}s on the board`;
        return (
          <div key={i} style={{ ...rungRow(isCurrent, skipped), cursor: skipped ? 'default' : 'pointer' }}
            onClick={() => { if (!skipped && !finishing) setCurrentIndex(i); }}>
            {sent ? <CheckCircle2 size={16} color="#5C8A66" /> : isCurrent ? <Play size={16} color="#D9552B" /> : <Circle size={16} color="#6d6f73" />}
            <span style={gradeBadgeStyle}>{entry.grade}</span>
            <span style={{ flex: 1 }}>
              {label}
              {entry.status === 'unsent-fallback' && <span style={{ fontSize: 11, color: '#8b8d91', marginLeft: 6 }}>not sent yet</span>}
            </span>
            {entry.random && !sent && !finishing && (
              <button
                aria-label={`Re-roll rung ${n}`}
                title={canReroll(rolled, i, problems) ? 'Re-roll' : `only one ${entry.grade}`}
                disabled={!canReroll(rolled, i, problems)}
                onClick={(e) => { e.stopPropagation(); setRolled((prev) => rerollRung(prev, i, problems)); }}
                style={{ background: 'none', border: 'none', color: '#C08552', cursor: 'pointer', padding: 4, display: 'flex' }}
              ><RefreshCw size={15} /></button>
            )}
            {isCurrent && !sent && (
              <button
                aria-label={`Sent ${entry.problem.name}`}
                disabled={sending}
                onClick={(e) => { e.stopPropagation(); handleSend(); }}
                style={{ ...primaryButton(!sending), padding: '7px 12px', fontSize: 13 }}
              >Sent ✓</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Wire into `App.jsx`**

1. Imports: `createWarmupSession` from `./lib/board`; `import { todayISO } from './lib/warmup';`; `import WarmupRun from './warmup/WarmupRun';`.
2. Handlers:
   ```js
   const handleWarmupSend = async (problemId) => {
     setError('');
     try {
       const created = await createTick(problemId, { sentOn: todayISO(), notes: '', sentBy: currentClimber?.name });
       setProblems((prev) => applySend(prev, problemId, created.sent_on));
       return true;
     } catch (err) {
       console.error(err);
       setError('Could not log that send — check your connection and try again.');
       return false;
     }
   };

   const handleFinishWarmup = async ({ feel, problemIds, sentIds }) => {
     setError('');
     try {
       const session = await createWarmupSession(board.id, {
         doneOn: todayISO(), climbedBy: currentClimber?.name, feel, problemIds, sentIds,
       });
       setWarmupSessions((prev) => [session, ...prev].slice(0, 10));
       setView('warmup');
       return true;
     } catch (err) {
       console.error(err);
       setError('Could not save that warm-up — check your connection and try again.');
       return false;
     }
   };
   ```
3. Render after the editor block:
   ```jsx
   {view === 'warmup-run' && (
     <WarmupRun
       rungs={warmupRungs}
       problems={problems}
       climberName={currentClimber?.name || ''}
       onFocus={setWarmupFocusId}
       onSend={handleWarmupSend}
       onFinish={handleFinishWarmup}
       onDiscard={() => setView('warmup')}
     />
   )}
   ```
4. `onStart` in the `WarmupScreen` render is already `() => setView('warmup-run')`.

- [ ] **Step 7: Run the full suite, lint and build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all PASS; build succeeds (the existing chunk-size warning is fine).

- [ ] **Step 8: Commit and push**

```bash
git add src/warmup/WarmupRun.jsx src/lib/problemList.js src/lib/problemList.test.js src/App.jsx src/App.test.jsx
git commit -m "feat: run a warm-up session that logs sends and records how it felt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Final check (after Task 5)

- [ ] `npx vitest run` — all pass; `npm run lint` clean; `npm run build` succeeds.
- [ ] Run `npm run dev` and click through: header Warm-up → Build your ladder → add 2 fixed + 1 random → Done → Start → Sent ✓ on first → re-roll the random → End → Normal → session appears in Last sessions. Confirm the board photo shows the current rung's holds and that New problem still sits far right in the header at 375px width.

# Provisional Grades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ungraded problems take grade votes and show the median vote as a provisional "V5?" grade that counts everywhere a grade counts, until someone sets a grade by hand.

**Architecture:** A pure `withShownGrades(problems, counted)` adds `shownGrade` and `gradeProvisional` to each problem once, in `App.jsx`. Every grade reader goes through `gradeOf(p)` (`p.shownGrade ?? p.grade`), so undecorated problems in existing tests behave exactly as before. The real `grade` is never overwritten. The edit form and the vote chips keep reading it.

**Tech Stack:** React 19 + Vite, Vitest + Testing Library, Supabase (no schema change).

**Spec:** `docs/superpowers/specs/2026-11-23-provisional-grades-design.md`

## Global Constraints

- No SQL and no new columns. Votes save through the existing `saveVote`.
- Ungraded means `gradeNumber(problem.grade) === null`.
- Provisional = the median of counted grade votes. An even count takes the lower middle (the easier grade). `feel` is ignored.
- A real V-grade always wins over votes.
- Provisional grades print as `V5?` in `#8b8d91`, never in orange `#D9552B`. The list and problem-page badges get a `1px dashed #3a3b3e` border.
- Grades printed on their own get no "?": the ticklist rows, the hardest tile, the weekly chart, the crew board's top grade and the warm-up rung grades.
- The edit form hint copy is exactly `Votes say V5`. The vote dropdown's empty option copy is exactly `No vote`.
- Work on branch `feat/provisional-grades`. Push after every commit.

## Review Focus

1. **Editing an ungraded "V5?" problem (rename only) must save `grade: ''`**, never `'V5'`. The test is in Task 4.
2. **A grade vote whose voter's only send is deleted stops counting**, so the "V5?" disappears or moves. The test is in Task 1 (`countedVotes` → `withShownGrades`).
3. **An ungraded problem with no votes looks exactly as today**: no badge in the list, and it sorts last. The test is in Task 2.
4. **A graded problem with grade votes never shows "?"** and still gets the five chips, not the dropdown. The test is in Task 4.
5. **Votes left from before a problem was set back to ungraded** (some with soft or hard) still give a whole-grade provisional. The test is in Task 1.

---

### Task 1: Shown-grade helpers

**Files:**
- Modify: `board-app/src/lib/votes.js`
- Modify: `board-app/src/lib/problemList.js`
- Test: `board-app/src/lib/votes.test.js`, `board-app/src/lib/problemList.test.js`

**Interfaces:**
- Produces (`problemList.js`):
  - `gradeOf(p) -> string|null|undefined`, which returns `p.shownGrade ?? p.grade`.
  - `gradeLabel(p) -> string`, which returns `''` when `gradeOf(p)` is falsy, `` `${gradeOf(p)}?` `` when `p.gradeProvisional`, and `gradeOf(p)` otherwise.
- Produces (`votes.js`):
  - `provisionalGrade(problemId, counted) -> string|null`.
  - `withShownGrades(problems, counted) -> problem[]`. Each problem is returned as `{ ...p, shownGrade, gradeProvisional }`. When `gradeNumber(p.grade) !== null`, that's `shownGrade: p.grade, gradeProvisional: false`. Otherwise it's the provisional grade with `gradeProvisional: true` if there is one, else `shownGrade: p.grade, gradeProvisional: false`.

- [ ] **Step 1: Create the branch**

Run: `git checkout -b feat/provisional-grades`

- [ ] **Step 2: Write the failing tests in `votes.test.js`**

Use the file's `V`/`T` helpers. Pass `feel` by spreading, for example `{ ...V('p1','A','V5',null), feel: 'hard' }`.

```js
describe('provisionalGrade', () => {
  it('takes the middle vote', () => {
    expect(provisionalGrade('p1', [V('p1','A','V4',null), V('p1','B','V6',null), V('p1','C','V5',null)])).toBe('V5');
  });
  it('takes the easier of the two middle votes on an even split', () => {
    expect(provisionalGrade('p1', [V('p1','A','V4',null), V('p1','B','V5',null)])).toBe('V4');
    expect(provisionalGrade('p1', [V('p1','A','V3',null), V('p1','B','V4',null), V('p1','C','V6',null), V('p1','D','V7',null)])).toBe('V4');
  });
  it('ignores soft/hard, star-only votes, unparseable grades and other problems', () => {
    expect(provisionalGrade('p1', [{ ...V('p1','A','V5',null), feel: 'hard' }, V('p1','B',null,4), V('p1','C','5+',null), V('p2','D','V9',null)])).toBe('V5');
  });
  it('is null with no grade votes', () => {
    expect(provisionalGrade('p1', [V('p1','A',null,4)])).toBeNull();
  });
});

describe('withShownGrades', () => {
  it('keeps a real grade even when the votes disagree', () => {
    const [p] = withShownGrades([{ id: 'p1', grade: 'V5' }], [V('p1','A','V7',null)]);
    expect(p).toMatchObject({ grade: 'V5', shownGrade: 'V5', gradeProvisional: false });
  });
  it('gives an ungraded problem its provisional grade without touching grade', () => {
    const [p] = withShownGrades([{ id: 'p1', grade: '' }], [V('p1','A','V5',null)]);
    expect(p).toMatchObject({ grade: '', shownGrade: 'V5', gradeProvisional: true });
  });
  it('leaves an ungraded problem with no votes ungraded', () => {
    const [p] = withShownGrades([{ id: 'p1', grade: null }], []);
    expect(p).toMatchObject({ shownGrade: null, gradeProvisional: false });
  });
  it("drops the provisional grade when its voter's send is deleted", () => {
    const votes = [V('p1','Rob','V5',null)];
    expect(withShownGrades([{ id: 'p1', grade: '' }], countedVotes(votes, [T('p1','Rob')]))[0].shownGrade).toBe('V5');
    expect(withShownGrades([{ id: 'p1', grade: '' }], countedVotes(votes, []))[0].gradeProvisional).toBe(false);
  });
});
```

- [ ] **Step 3: Write the failing tests in `problemList.test.js`**

```js
describe('gradeOf and gradeLabel', () => {
  it('prefers the shown grade and marks a provisional one', () => {
    expect(gradeOf({ grade: '', shownGrade: 'V5' })).toBe('V5');
    expect(gradeOf({ grade: 'V3' })).toBe('V3');
    expect(gradeLabel({ grade: '', shownGrade: 'V5', gradeProvisional: true })).toBe('V5?');
    expect(gradeLabel({ grade: 'V3', shownGrade: 'V3', gradeProvisional: false })).toBe('V3');
    expect(gradeLabel({ grade: null })).toBe('');
  });
});
```

- [ ] **Step 4: Run them and check they fail**

Run: `cd board-app && npx vitest run src/lib/votes.test.js src/lib/problemList.test.js`
Expected: FAIL, because `provisionalGrade`, `withShownGrades`, `gradeOf` and `gradeLabel` are not exported.

- [ ] **Step 5: Implement the four functions to the Interfaces above**

To get the median: filter `counted` to this problem with `gradeNumber(v.grade) !== null`, sort by `gradeNumber`, then take the element at index `Math.floor((n - 1) / 2)`.

- [ ] **Step 6: Run them and check they pass**

Run: `cd board-app && npx vitest run src/lib/votes.test.js src/lib/problemList.test.js`
Expected: PASS.

- [ ] **Step 7: Commit and push**

```bash
git add board-app/src/lib/votes.js board-app/src/lib/votes.test.js board-app/src/lib/problemList.js board-app/src/lib/problemList.test.js
git commit -m "feat: work out provisional grades from votes"
git push -u origin feat/provisional-grades
```

---

### Task 2: Grade readers use the shown grade

**Files:**
- Modify: `board-app/src/lib/problemList.js` (`sortAndFilterProblems`)
- Modify: `board-app/src/lib/boardStats.js` (`summary`, `crewBoard`)
- Modify: `board-app/src/lib/progress.js` (`ticklist`, `mostClimbed`)
- Modify: `board-app/src/lib/sends.js` (`buildLogbook`)
- Modify: `board-app/src/lib/warmup.js` (`poolFor`)
- Test: the matching `*.test.js` for each

**Interfaces:**
- Consumes: `gradeOf` from Task 1.
- Produces:
  - `summary(p)` in boardStats returns `{ id, name, grade: gradeOf(p), gradeProvisional: p.gradeProvisional }`.
  - `buildLogbook` rows are `{ id, name, grade: gradeOf(p), gradeProvisional: p.gradeProvisional, firstSend, flashed }`.
  - `mostClimbed` rows are `{ id, name, grade, gradeProvisional, sessions }`.
  - `gradeProvisional` is `undefined` for undecorated problems, so existing `toEqual` expectations still hold.

- [ ] **Step 1: Write the failing tests**

Each test uses a decorated provisional problem built as `{ ...P(...), grade: '', shownGrade: 'V5', gradeProvisional: true }`, in each file's own helper style.
- `problemList.test.js`, "sorts a provisional problem at its provisional grade, and an ungraded one with no votes last": with problems V3, provisional V5, real V7 and ungraded-no-votes, `grade-asc` gives `[V3, V5?, V7, ungraded]`.
- `boardStats.test.js`, "counts a provisional grade as the crew board top and in summaries": a send of the provisional problem makes that climber's `top` equal `5`. `openProjects` puts it among the V5s, and its row has `grade: 'V5', gradeProvisional: true`.
- `progress.test.js`, "puts a provisional problem in the ticklist and the hardest tile": `ticklist` has a `grade: 5` row counting it, and `progressTiles(...).hardest` is `5`.
- `sends.test.js`, "carries the shown grade and the provisional flag into logbook rows": the row has `grade: 'V5', gradeProvisional: true`.
- `warmup.test.js`, "draws a provisional problem for a random rung of its grade": `rollLadder([{ grade: 'V5', problemId: null }], [provisional])[0].problem.id` is the provisional problem's id.

- [ ] **Step 2: Run them and check they fail**

Run: `cd board-app && npx vitest run src/lib`
Expected: the five new tests FAIL, and all existing tests pass.

- [ ] **Step 3: Swap `p.grade` for `gradeOf(p)` in each reader listed under Files**

- `crewBoard`: use `gradeNumber(gradeOf(byId.get(t.problem_id)))`.
- `hardestOf`, `openProjects` and `mostClimbed` read rows that already carry the shown grade, so they only need `gradeProvisional` passed through.
- `import { gradeOf } from './problemList'` wherever it's needed. `warmup.js` must not import `votes.js`.

- [ ] **Step 4: Run them and check they pass**

Run: `cd board-app && npx vitest run src/lib`
Expected: PASS, with every existing test unchanged.

- [ ] **Step 5: Commit and push**

```bash
git add board-app/src/lib
git commit -m "feat: count provisional grades in sorting, stats, logbook and warm-ups"
git push
```

---

### Task 3: Dropdown grade vote for ungraded problems

**Files:**
- Modify: `board-app/src/votes/VotePicker.jsx`
- Test: `board-app/src/votes/VotePicker.test.jsx`

**Interfaces:**
- Produces: a new `VotePicker` prop, `anyGrade = false`. When it's true, the Grade row renders a `<select aria-label="Grade vote">` instead of the chip group, whatever `choices` is. Its options are `No vote` (value `''`), then each of `GRADES`. Its value is `grade ?? ''`. On change it calls `onChange({ grade: value || null, feel: null, stars })`. It's disabled when `disabled` is set. The row keeps the "Grade" label.

- [ ] **Step 1: Write the failing tests**
  - "shows a grade dropdown starting on No vote when anyGrade": render with `anyGrade choices={[]} grade={null}`. `getByRole('combobox', { name: 'Grade vote' })` has value `''`, and its first option's text is `No vote`.
  - "picking from the dropdown reports a whole grade and keeps the stars": with `stars={4}`, `selectOptions(..., 'V6')` calls `onChange` with `{ grade: 'V6', feel: null, stars: 4 }`.
  - "No vote clears just the grade": with `grade="V6" stars={4}`, selecting `''` calls `onChange` with `{ grade: null, feel: null, stars: 4 }`.

- [ ] **Step 2: Run them and check they fail**

Run: `cd board-app && npx vitest run src/votes`
Expected: FAIL, because there's no combobox.

- [ ] **Step 3: Implement the `anyGrade` branch in `VotePicker`**

Style the select with the app's `inputStyle` from `../ui` (or the nearest existing select style), at full width.

- [ ] **Step 4: Run them and check they pass**

Run: `cd board-app && npx vitest run src/votes`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add board-app/src/votes
git commit -m "feat: grade dropdown in the vote picker for ungraded problems"
git push
```

---

### Task 4: Wire it into the app

**Files:**
- Modify: `board-app/src/App.jsx`: the `counted` memo (~line 371), `selected` (~827), `visibleProblems` (~843), the list badge (~1178), the detail badge (~1198), both `<VotePicker>` uses (~1238, ~1292), the edit form grade field (~1061), and the props passed to the Logbook, BoardStats and Warmup screens (~1390–1440).
- Modify: `board-app/src/logbook/LogbookScreen.jsx:61`, `board-app/src/logbook/ProgressTab.jsx:94`, `board-app/src/stats/BoardStatsScreen.jsx:36`, `board-app/src/warmup/WarmupEditor.jsx:93-94`
- Test: `board-app/src/App.test.jsx`

**Interfaces:**
- Consumes: `withShownGrades` and `provisionalGrade` (Task 1), `gradeOf` and `gradeLabel` (Task 1), the `VotePicker` `anyGrade` prop (Task 3).

- [ ] **Step 1: Write the failing tests**

Add a `describe('App (provisional grades)')` block modelled on `App (votes)`. Use an ungraded problem `CRIMP = { id: 'p1', name: 'Crimp Line', grade: '', ... }` with Rob and Shawn sends and votes of V5 and V6. Its provisional grade is V5, the easier of the two.
  - "shows the provisional grade with a ? in the list and on the problem page": `getByText('V5?')` in the list. After opening the problem, `getByText('V5?')` and `getByText('Grade votes: V5 ×1 · V6 ×1')`.
  - "offers a grade dropdown, not chips, on an ungraded problem": in the first-send form (Rob with no ticks), `getByRole('combobox', { name: 'Grade vote' })` exists and `queryByRole('group', { name: 'Grade vote' })` is null.
  - "saves a dropdown grade vote with the send": select `V6`, click Save entry, and `saveVote` is called with `('p1', 'Rob', { grade: 'V6', feel: null, stars: null })`.
  - "hints at the votes in the edit form but saves the problem ungraded": open the edit details, `getByText('Votes say V5')` is shown, the Grade select's value is `''`, change only the name, save, and `updateProblem` is called with an object containing `grade: ''`.
  - "a graded problem with grade votes shows no ? and keeps its chips": with `grade: 'V5'`, `queryByText('V5?')` is null and the chip group `Grade vote` is present.
  - "counts a provisional send in the logbook": the logbook row for Crimp Line shows `V5?`.

- [ ] **Step 2: Run them and check they fail**

Run: `cd board-app && npx vitest run src/App.test.jsx -t "provisional grades"`
Expected: FAIL.

- [ ] **Step 3: Add `shownProblems` in `App.jsx`**

Add `const shownProblems = useMemo(() => withShownGrades(problems, counted), [problems, counted]);` after `counted`.
- Use `shownProblems` for `selected`, `visibleProblems`, and the `problems` prop of `LogbookScreen`, `BoardStatsScreen`, `WarmupScreen`, `WarmupEditor` and `WarmupRun`.
- Keep raw `problems` for `editingProblem`, `warmupFocus`, `setProblems` updates and the hold and photo code.

- [ ] **Step 4: Update the badges and the grade cells**

- In the list and on the problem page, render when `gradeOf(p)` is set and show `gradeLabel(p)`. When `p.gradeProvisional`, use `color: '#8b8d91'` and `border: '1px dashed #3a3b3e'`.
- In `LogbookScreen`, `ProgressTab` (Most climbed) and `BoardStatsScreen` rows, show `gradeLabel(row) || '–'` in `#8b8d91` when `row.gradeProvisional`. Logbook rows keep their current blank when ungraded.
- In `WarmupEditor`, use `gradeOf(p)` for the `disabled` check and for the `place` grade, and `gradeLabel(p) || '—'` for the badge text.

- [ ] **Step 5: Pass the dropdown flag to both vote pickers**

On both `<VotePicker>`s, pass `anyGrade={gradeNumber(selected.grade) === null}`, adding `gradeNumber`, `gradeOf` and `gradeLabel` to App's `./lib/problemList` import. Leave `gradeChoices(selected.grade, …)` reading the real grade.

- [ ] **Step 6: Add the edit form hint**

Under the edit form's Grade select, show `<p>` text `` `Votes say ${hint}` `` when `editingId && grade === '' && (hint = provisionalGrade(editingId, counted))`. Use 12.5px `#8b8d91`, margin-top 4px.

- [ ] **Step 7: Run the whole suite, lint and build**

Run: `cd board-app && npm test && npm run lint && npm run build`
Expected: all pass, with no lint errors.

- [ ] **Step 8: Commit and push**

```bash
git add board-app/src
git commit -m "feat: show provisional grades and take grade votes on ungraded problems"
git push
```

---

### Task 5: Check it by eye and hand over

- [ ] **Step 1:** Run the dev server against live data, and open an ungraded problem in the iOS 17 Simulator at 360px and 390px. Check the dropdown fits on the send form and in Your vote, that "V5?" reads as clearly not a real grade in the list and on the page, and that the edit form hint sits under the grade select.
- [ ] **Step 2:** Tell Rob the branch is ready to test on his phone over the LAN. Votes cast while testing are real.
- [ ] **Step 3:** Once Rob is happy, open a PR from `feat/provisional-grades` to `main`.

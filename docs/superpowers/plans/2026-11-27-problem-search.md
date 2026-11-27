# Problem Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A search box on the board list that filters problems by name, setter or grade as you type.

**Architecture:** A pure `matchesSearch` in `lib/problemList.js`, applied by `sortAndFilterProblems` before Unsent and sort. `App.jsx` holds the query in state and renders one input row under the sort / Unsent / climber row.

**Tech Stack:** React 19, Vite, Vitest + Testing Library, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-11-27-problem-search-design.md`

## Global Constraints

- Work on branch `feat/problem-search` off `main`; push every commit to that branch as soon as it's made, never to `main`.
- No network request on typing: filter the problems already in memory.
- Matching is case-insensitive; uses `String.prototype.includes`, never a `RegExp` built from the query.
- Search input text is 16px (stops iOS Safari zooming on focus).
- Search does not touch Your projects.
- Run tests from `board-app/`: `npx vitest run <file>`.

## Review Focus

1. A problem with `setter`, `grade` or `notes` null/empty → search must not throw (test in Task 1).
2. Extra spaces (`"  crimp   rob "`) → same result as `"crimp rob"` (test in Task 1).
3. Search + Unsent together empty the list → "No problems match ‘…’", not "Nothing unsent" (test in Task 2).
4. Open a result, go back → the query and filtered list are still there (test in Task 2).
5. Regex characters in the query (`v5(`, `.*`) → treated as plain text, no crash (test in Task 1).

---

### Task 1: Matcher and search option

**Files:**
- Modify: `board-app/src/lib/problemList.js`
- Test: `board-app/src/lib/problemList.test.js`

**Interfaces:**
- Produces:
  - `matchesSearch(problem, query: string): boolean`
  - `sortAndFilterProblems(problems, { sort, unsentOnly, sentIds, search = '' })` — new `search` option, applied first.

- [ ] **Step 1: Create the branch**

Run (from repo root): `git switch -c feat/problem-search`

- [ ] **Step 2: Write the failing tests** in a new `describe('matchesSearch')` and one new case in `describe('sortAndFilterProblems')`:

```js
const P = { id: 'x', name: 'Crimpy Traverse', setter: 'Rob', grade: 'V5' };

it('matches everything for an empty or all-space query', () => {
  expect(matchesSearch(P, '')).toBe(true);
  expect(matchesSearch(P, '   ')).toBe(true);
});
it('matches part of the name or setter, ignoring case', () => {
  expect(matchesSearch(P, 'crimp')).toBe(true);
  expect(matchesSearch(P, 'ROB')).toBe(true);
  expect(matchesSearch(P, 'jug')).toBe(false);
});
it('needs every word to match, ignoring extra spaces', () => {
  expect(matchesSearch(P, '  crimp   rob ')).toBe(true);
  expect(matchesSearch(P, 'crimp sam')).toBe(false);
});
it('matches a grade only exactly, using the shown grade', () => {
  expect(matchesSearch(P, 'v5')).toBe(true);
  expect(matchesSearch({ ...P, grade: 'V10' }, 'v1')).toBe(false);
  expect(matchesSearch({ ...P, grade: null, shownGrade: 'V4', gradeProvisional: true }, 'v4')).toBe(true);
});
it('copes with missing setter and grade', () => {
  expect(matchesSearch({ id: 'y', name: 'Bare', setter: null, grade: null }, 'rob')).toBe(false);
  expect(matchesSearch({ id: 'y', name: 'Bare', setter: null, grade: null }, 'bare')).toBe(true);
});
it('treats regex characters as plain text', () => {
  expect(matchesSearch(P, 'v5(')).toBe(false);
  expect(matchesSearch(P, '.*')).toBe(false);
});

// in describe('sortAndFilterProblems')
it('filters by search before Unsent and sort', () => {
  const list = [
    { id: 'a', name: 'Crimp one', grade: 'V6', send_count: 0 },
    { id: 'b', name: 'Jug haul', grade: 'V2', send_count: 0 },
    { id: 'c', name: 'Crimp two', grade: 'V3', send_count: 1 },
    { id: 'd', name: 'Crimp three', grade: 'V4', send_count: 0 },
  ];
  expect(ids(sortAndFilterProblems(list, { search: 'crimp', unsentOnly: true, sort: 'grade-asc' }))).toEqual(['d', 'a']);
});
```

- [ ] **Step 3: Run** `npx vitest run src/lib/problemList.test.js` — expect FAIL (`matchesSearch` is not exported).

- [ ] **Step 4: Implement** `matchesSearch` (split trimmed, lower-cased query on `/\s+/`; each word must be in `name` or `setter` via `includes`, or equal `gradeOf(p)` lower-cased; null fields read as `''`) and the `search` option in `sortAndFilterProblems`.

- [ ] **Step 5: Run** `npx vitest run src/lib/problemList.test.js` — expect PASS.

- [ ] **Step 6: Commit and push**

```bash
git add board-app/src/lib/problemList.js board-app/src/lib/problemList.test.js
git commit -m "feat: match problems by name, setter or grade for search"
git push -u origin feat/problem-search
```

---

### Task 2: Search row on the board list

**Files:**
- Modify: `board-app/src/App.jsx` (list block, ~lines 1150–1250; `visibleProblems` ~line 898)
- Test: `board-app/src/App.test.jsx` (new `describe('App (search)')`)

**Interfaces:**
- Consumes: `sortAndFilterProblems(..., { search })` from Task 1.

- [ ] **Step 1: Write the failing tests.** Seed `listProblems` with `Crimpy Traverse` (V5, Rob, `send_count: 1`), `Jug Haul` (V2, Sam, `send_count: 0`), `Crimp Ladder` (V3, Sam, `send_count: 0`). Tests:
  - `'filters the list as you type and clears with the ✕'`: type `crimp` into `getByRole('searchbox', { name: 'Search problems' })` → `Crimpy Traverse` and `Crimp Ladder` shown, `Jug Haul` gone; click `getByRole('button', { name: 'Clear search' })` → all three shown and box empty.
  - `'says nothing matches the search, even with Unsent on'`: click Unsent, type `traverse` → `getByText('No problems match ‘traverse’')`, and `queryByText(/Nothing unsent/)` is null.
  - `'keeps the search after opening a problem and coming back'`: type `jug`, click `Jug Haul`, click the `Board` back button → box still `jug`, only `Jug Haul` listed.
  - `'closes the keyboard on Enter and keeps the filter'`: focus the box, type `jug{Enter}` → box is not `document.activeElement`, only `Jug Haul` listed.
  - `'has no search box when there are no problems'`: default empty board → `queryByRole('searchbox')` is null.

- [ ] **Step 2: Run** `npx vitest run src/App.test.jsx -t "App (search)"` — expect FAIL.

- [ ] **Step 3: Implement** in `App.jsx`:
  - `const [search, setSearch] = useState('')`; pass `search` into the existing `sortAndFilterProblems` call.
  - When `problems.length > 0`, a row right after the sort / Unsent / climber row (before `ClimberPanel` and `YourProjects`): lucide `Search` icon, `<input type="search" enterKeyHint="search" aria-label="Search problems" placeholder="Search problems">` styled from `inputStyle` with `fontSize: 16`, `marginTop: 0`; an `X` button `aria-label="Clear search"` shown only when `search` is non-empty. Hide the native search cancel button (`WebkitAppearance: 'none'` / `::-webkit-search-cancel-button` via the existing `<style>` if needed) so only one ✕ shows.
  - Enter (`onKeyDown` key `Enter`) calls `e.currentTarget.blur()`.
  - Empty state: when `visibleProblems` is empty and `search.trim()` is set, show `No problems match ‘${search.trim()}’` in place of "Nothing unsent — go set something new." (same styling).

- [ ] **Step 4: Run** `npx vitest run src/App.test.jsx` — expect all PASS (search tests and the existing ones).

- [ ] **Step 5: Full check** from `board-app/`: `npm test && npm run lint && npm run build` — all pass.

- [ ] **Step 6: Commit and push**

```bash
git add board-app/src/App.jsx board-app/src/App.test.jsx
git commit -m "feat: search box on the board list"
git push
```

- [ ] **Step 7: Hand over.** Start `npm run dev -- --host` from `board-app/`; give Rob the Network URL to try on his phone, and remind him the local app uses the live Supabase data. Check at 360px width that the row fits and focusing the box doesn't zoom. PR to `main` only after he's tried it.

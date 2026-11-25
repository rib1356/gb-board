# Soft and Hard Votes on Ungraded Problems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After picking a grade in an ungraded problem's grade dropdown, a climber can mark it soft or hard.

**Architecture:** `VotePicker` gains a three-chip "Grade feel" row under the `anyGrade` dropdown, shown only when a grade is picked. It reports `{ grade, feel, stars }` through the existing `onChange`, so the send form, Your vote and `saveVote` need no change.

**Tech Stack:** React + Vite, Vitest + Testing Library, oxlint.

**Spec:** `docs/superpowers/specs/2026-11-25-soft-hard-on-ungraded-design.md`

## Global Constraints

- No database change; votes already store `feel` as `'soft' | 'hard' | null`.
- Chip labels come from `gradeVoteLabel` (`src/lib/votes.js`): "soft V5", "V5", "hard V5".
- Chips use the existing `chipStyle(picked)` in `VotePicker.jsx`.
- The new row is `role="group"` with `aria-label="Grade feel"` (the graded chip row keeps "Grade vote").
- The provisional grade (`provisionalGrade`) is unchanged.
- Branch `feat/soft-hard-ungraded` off `main`. Run commands from `board-app/`.

## Review Focus

1. A loaded vote with `feel: undefined` (old rows) shows plain as pressed, not nothing.
2. Changing the dropdown grade after picking hard resets feel to null.
3. Tapping the already-picked plain chip does nothing (doesn't clear the grade).
4. Chips ignore taps while `disabled` (the send is saving).
5. Your vote on an ungraded problem saves the feel straight away and the "Grade votes" line updates.

---

### Task 1: Feel chips in VotePicker

**Files:**
- Modify: `board-app/src/votes/VotePicker.jsx` (the `anyGrade` block)
- Test: `board-app/src/votes/VotePicker.test.jsx` (`describe('VotePicker for an ungraded problem')`)

**Interfaces:**
- Consumes: `gradeVoteLabel({ grade, feel })` from `src/lib/votes.js`.
- Produces: no new props. With `anyGrade` and a `grade`, a `group` named "Grade feel" holding three buttons named `soft ${grade}`, `${grade}`, `hard ${grade}`, each with `aria-pressed`.

- [ ] **Step 1: Write the failing tests** in the ungraded `describe`, with `const feelRow = () => within(screen.getByRole('group', { name: 'Grade feel' }));`

```jsx
it('shows no feel chips until a grade is picked', () => {
  render(<VotePicker anyGrade choices={[]} grade={null} feel={null} stars={null} onChange={vi.fn()} />);
  expect(screen.queryByRole('group', { name: 'Grade feel' })).not.toBeInTheDocument();
});
it('shows soft, plain and hard of the picked grade, plain pressed by default', () => {
  render(<VotePicker anyGrade choices={[]} grade="V5" feel={undefined} stars={null} onChange={vi.fn()} />);
  expect(feelRow().getAllByRole('button').map((b) => b.textContent)).toEqual(['soft V5', 'V5', 'hard V5']);
  expect(feelRow().getByRole('button', { name: 'V5' })).toHaveAttribute('aria-pressed', 'true');
  expect(feelRow().getByRole('button', { name: 'hard V5' })).toHaveAttribute('aria-pressed', 'false');
});
it('shows the saved feel as pressed', () => {
  render(<VotePicker anyGrade choices={[]} grade="V5" feel="hard" stars={null} onChange={vi.fn()} />);
  expect(feelRow().getByRole('button', { name: 'hard V5' })).toHaveAttribute('aria-pressed', 'true');
  expect(feelRow().getByRole('button', { name: 'V5' })).toHaveAttribute('aria-pressed', 'false');
});
it('picking soft or hard reports the feel and keeps the stars', async () => {
  const onChange = vi.fn();
  render(<VotePicker anyGrade choices={[]} grade="V5" feel={null} stars={4} onChange={onChange} />);
  await userEvent.click(feelRow().getByRole('button', { name: 'hard V5' }));
  expect(onChange).toHaveBeenCalledWith({ grade: 'V5', feel: 'hard', stars: 4 });
});
it('tapping the picked soft or hard goes back to plain', async () => {
  const onChange = vi.fn();
  render(<VotePicker anyGrade choices={[]} grade="V5" feel="soft" stars={4} onChange={onChange} />);
  await userEvent.click(feelRow().getByRole('button', { name: 'soft V5' }));
  expect(onChange).toHaveBeenCalledWith({ grade: 'V5', feel: null, stars: 4 });
});
it('tapping plain when plain is picked does nothing', async () => {
  const onChange = vi.fn();
  render(<VotePicker anyGrade choices={[]} grade="V5" feel={null} stars={4} onChange={onChange} />);
  await userEvent.click(feelRow().getByRole('button', { name: 'V5' }));
  expect(onChange).not.toHaveBeenCalled();
});
it('changing the grade after picking hard resets the feel', async () => {
  const onChange = vi.fn();
  render(<VotePicker anyGrade choices={[]} grade="V5" feel="hard" stars={4} onChange={onChange} />);
  await userEvent.selectOptions(dropdown(), 'V6');
  expect(onChange).toHaveBeenCalledWith({ grade: 'V6', feel: null, stars: 4 });
});
it('feel chips ignore taps while disabled', async () => {
  const onChange = vi.fn();
  render(<VotePicker anyGrade disabled choices={[]} grade="V5" feel={null} stars={4} onChange={onChange} />);
  await userEvent.click(feelRow().getByRole('button', { name: 'hard V5' }));
  expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/votes/VotePicker.test.jsx`
Expected: the new tests FAIL (no "Grade feel" group); "shows no feel chips…" and "changing the grade…" may already pass.

- [ ] **Step 3: Implement** in the `anyGrade` block of `VotePicker.jsx`: after the dropdown row, when `grade` is set, render the "Grade feel" group of three buttons for `[{ feel: 'soft' }, { feel: null }, { feel: 'hard' }]`, label `gradeVoteLabel({ grade, feel })`, pressed when `feel === (props.feel ?? null)`, `disabled={disabled}`, `chipStyle(picked)`. On click: plain when picked → no call; soft/hard when picked → `onChange({ grade, feel: null, stars })`; otherwise `onChange({ grade, feel: c.feel, stars })`. The row has no label, so the chips sit directly under the dropdown. Update the component comment: the dropdown votes a grade, then soft/plain/hard.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/votes/VotePicker.test.jsx`
Expected: all PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/votes/VotePicker.jsx src/votes/VotePicker.test.jsx
git commit -m "feat: soft and hard chips under the grade dropdown for ungraded problems"
git push
```

### Task 2: Pin the send form and Your vote in App

**Files:**
- Test: `board-app/src/App.test.jsx` (`describe('App (provisional grades)')`)
- Modify (only if a test fails): `board-app/src/App.jsx`

**Interfaces:**
- Consumes: Task 1's "Grade feel" group; the existing `load`, `open`, `CRIMP`, `SHAWN_SEND`, `SHAWN_VOTE`, `ROB_VOTE` fixtures in that `describe`.

- [ ] **Step 1: Write the tests**

```jsx
it('saves a soft or hard grade vote with the send', async () => {
  createTick.mockImplementation(async (problemId, { sentOn, notes, sentBy, flash }) => ({
    id: 't9', problem_id: problemId, sent_on: sentOn, notes, sent_by: sentBy, flash, created_at: '2026-10-22T10:00:00Z',
  }));
  saveVote.mockResolvedValue({ id: 'v9', problem_id: 'p1', climber: 'Rob', grade: 'V5', feel: 'hard', stars: null });
  const user = await load({ ticks: [SHAWN_SEND], votes: [SHAWN_VOTE] });
  await open(user);
  await user.click(screen.getByText('Log a send'));
  fireEvent.change(screen.getByLabelText('Send date'), { target: { value: '2026-10-22' } });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Grade vote' }), 'V5');
  await user.click(within(screen.getByRole('group', { name: 'Grade feel' })).getByRole('button', { name: 'hard V5' }));
  await user.click(screen.getByText('Save entry'));
  await waitFor(() => expect(saveVote).toHaveBeenCalledWith('p1', 'Rob', { grade: 'V5', feel: 'hard', stars: null }));
});

it('changes the feel from Your vote on an ungraded problem', async () => {
  saveVote.mockResolvedValue({ ...ROB_VOTE, feel: 'hard' });
  const user = await load();
  await open(user);
  await user.click(within(screen.getByRole('group', { name: 'Grade feel' })).getByRole('button', { name: 'hard V5' }));
  await waitFor(() => expect(saveVote).toHaveBeenCalledWith('p1', 'Rob', { grade: 'V5', feel: 'hard', stars: null }));
  expect(await screen.findByText('Grade votes: hard V5 ×1 · V6 ×1')).toBeInTheDocument();
  expect(screen.getByText('V5?')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/App.test.jsx -t "provisional grades"`
Expected: PASS with no `App.jsx` change (the props already flow through). If a test fails, fix `App.jsx` minimally and rerun.

- [ ] **Step 3: Full check**

Run: `npm run lint && npm test && npm run build`
Expected: lint clean, all tests pass, build succeeds.

- [ ] **Step 4: Commit and push**

```bash
git add src/App.test.jsx
git commit -m "test: soft and hard votes on ungraded problems from the send form and Your vote"
git push
```

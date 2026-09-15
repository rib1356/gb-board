# Climber Profiles & Send Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared, no-auth "who am I on this device" roster of climber names, so a `setter` field can be prefilled and each logged send can be attributed to whoever logged it.

**Architecture:** A new `climbers` table (flat, shared, Supabase-backed) plus a `sent_by` text column on `ticks`. Two new `board.js` API functions (`listClimbers`, `createClimber`) and an optional `sentBy` param on the existing `createTick`. A new `src/lib/climberStorage.js` isolates the `localStorage` read/write (mirrors how `holds.js`/`image.js` isolate pure logic from `App.jsx`). `App.jsx` gains one new inline helper component (`ClimberPicker`, alongside the existing `ChalkRing`/`StarRating`/`Field` pattern) plus new state, one extended effect, two new handlers, and small edits to three existing render blocks and one existing handler.

**Tech Stack:** React 18, Vite, `@supabase/supabase-js`, Vitest + `@testing-library/react` (same stack as the rest of `board-app/`).

**Spec:** `docs/superpowers/specs/2026-09-15-climber-profiles-design.md`

## Global Constraints

- No authentication. Row Level Security stays disabled on `climbers`, consistent with every other table — this is a convenience layer, not a security boundary (spec's explicit tradeoff, not a gap to fix).
- `ticks.sent_by` is a plain `text` column, **not** a foreign key to `climbers` — it's a text snapshot at log time, so renaming/removing a climber later does not retroactively change past logs (spec's "Decision" section).
- No `board_id` scoping on `climbers` — this app only ever has one board, same reasoning as the rest of the schema.
- Climbers are add-only: no edit/delete UI. `setter` stays free text, just prefilled — never a strict picker.
- No backfilling `sent_by` on existing ticks; they display with no name, exactly as they do today.
- `App.jsx` stays a single file (plus its existing small helper components) — do not split it further.
- Reuse existing visual language exactly: `#17181A` background, `#232427` panel background, `#2A2B2E`/`#3a3b3e` borders, `#EDEAE3` text, `#8b8d91` muted text, `#5C8A66` green (affirmative actions), `#C08552` rust-tan (links/undo), `#D9552B` rust (primary actions/destructive). Do not introduce new colors.
- `localStorage` reads/writes are always wrapped in try/catch, falling back to "no climber selected" / "selection not persisted" rather than throwing — same posture as every other browser-storage touchpoint in this app.

---

### Task 1: `src/lib/board.js` — climbers API + send attribution

**Files:**
- Modify: `board-app/src/lib/board.js`
- Modify: `board-app/src/lib/board.test.js`

**Interfaces:**
- Produces: `listClimbers()` → `Promise<Array<{id, name, created_at}>>`, ordered by `name` ascending. `createClimber(name)` → `Promise<{id, name, created_at}>`, trims `name`. `createTick(problemId, { sentOn, notes, sentBy })` — `sentBy` is a new, optional third field; when omitted, `sent_by` is written as `undefined` (Supabase/Postgres treats this the same as not setting it — the column is nullable). These three functions are consumed by Task 3 and Task 4.

**External setup (not part of this task, informational):** the `climbers` table and `ticks.sent_by` column must exist in Supabase before this feature works end-to-end. That SQL is being surfaced directly to the user in chat (also recorded in the spec's "External setup step") — it is **not** something this task's tests depend on, since all tests mock `supabase`.

- [ ] **Step 1: Add the failing tests**

In `board-app/src/lib/board.test.js`, add `listClimbers` and `createClimber` to the import line:

```js
import {
  getOrCreateBoard,
  listProblems,
  uploadBoardPhoto,
  uploadProblemMask,
  createProblem,
  deleteProblem,
  rateProblem,
  updateProblem,
  restoreProblem,
  listTicks,
  createTick,
  deleteTick,
  listClimbers,
  createClimber,
} from './board';
```

Add two new `describe` blocks anywhere after the `chain()` helper definition (e.g. right before `describe('listTicks', ...)`):

```js
describe('listClimbers', () => {
  it('lists climbers alphabetically by name', async () => {
    const rows = [{ id: 'c1', name: 'Alice' }, { id: 'c2', name: 'Bob' }];
    const c = chain({ data: rows, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await listClimbers();
    expect(result).toEqual(rows);
    expect(mocks.supabase.from).toHaveBeenCalledWith('climbers');
    expect(c.order).toHaveBeenCalledWith('name', { ascending: true });
  });
});

describe('createClimber', () => {
  it('inserts a trimmed climber name', async () => {
    const created = { id: 'c1', name: 'Rob' };
    const c = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await createClimber('  Rob  ');
    expect(result).toEqual(created);
    expect(mocks.supabase.from).toHaveBeenCalledWith('climbers');
    expect(c.insert).toHaveBeenCalledWith({ name: 'Rob' });
  });
});
```

Add one new test inside the existing `describe('createTick', ...)` block, after its current test:

```js
  it('stores the climber name that logged the send', async () => {
    const created = { id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: '', sent_by: 'Rob' };
    const c = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await createTick('p1', { sentOn: '2026-08-22', notes: '', sentBy: 'Rob' });
    expect(result).toEqual(created);
    expect(c.insert).toHaveBeenCalledWith({ problem_id: 'p1', sent_on: '2026-08-22', notes: '', sent_by: 'Rob' });
  });
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test` (from `board-app/`)
Expected: FAIL — `listClimbers`/`createClimber` are not exported from `./board`, and the new `createTick` test's `sent_by: 'Rob'` assertion doesn't match today's insert payload.

- [ ] **Step 3: Implement**

In `board-app/src/lib/board.js`, add these two functions (placed near `listTicks`/`createTick`, e.g. directly above `export async function listTicks`):

```js
export async function listClimbers() {
  const { data, error } = await supabase
    .from('climbers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createClimber(name) {
  const { data, error } = await supabase
    .from('climbers')
    .insert({ name: name.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

Replace the existing `createTick`:

```js
export async function createTick(problemId, { sentOn, notes }) {
  const { data, error } = await supabase
    .from('ticks')
    .insert({ problem_id: problemId, sent_on: sentOn, notes: notes.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

with:

```js
export async function createTick(problemId, { sentOn, notes, sentBy }) {
  const { data, error } = await supabase
    .from('ticks')
    .insert({ problem_id: problemId, sent_on: sentOn, notes: notes.trim(), sent_by: sentBy })
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test` (from `board-app/`)
Expected: PASS, all tests including the three new ones.

- [ ] **Step 5: Commit**

```bash
git add board-app/src/lib/board.js board-app/src/lib/board.test.js
git commit -m "feat: add climbers API and send attribution to createTick"
```

---

### Task 2: `src/lib/climberStorage.js` — per-browser current-climber persistence

**Files:**
- Create: `board-app/src/lib/climberStorage.js`
- Test: `board-app/src/lib/climberStorage.test.js`

**Interfaces:**
- Produces: `getStoredClimberId()` → `string | null` (reads `localStorage`, never throws). `setStoredClimberId(id)` → `void` (writes `localStorage`, never throws). Both are consumed by Task 3.
- Storage key: `'board-app:currentClimberId'` (exact string, matches the spec).

- [ ] **Step 1: Write the failing tests**

Create `board-app/src/lib/climberStorage.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredClimberId, setStoredClimberId } from './climberStorage';

beforeEach(() => {
  localStorage.clear();
});

describe('getStoredClimberId', () => {
  it('returns null when nothing has been stored', () => {
    expect(getStoredClimberId()).toBeNull();
  });

  it('returns a previously stored id', () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    expect(getStoredClimberId()).toBe('c1');
  });

  it('returns null instead of throwing when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(getStoredClimberId()).toBeNull();
    spy.mockRestore();
  });
});

describe('setStoredClimberId', () => {
  it('persists the id under the storage key', () => {
    setStoredClimberId('c1');
    expect(localStorage.getItem('board-app:currentClimberId')).toBe('c1');
  });

  it('does not throw when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(() => setStoredClimberId('c1')).not.toThrow();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test` (from `board-app/`)
Expected: FAIL — `board-app/src/lib/climberStorage.js` does not exist yet.

- [ ] **Step 3: Implement**

Create `board-app/src/lib/climberStorage.js`:

```js
const STORAGE_KEY = 'board-app:currentClimberId';

export function getStoredClimberId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredClimberId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Selection just won't persist this session (private browsing, quota) --
    // the app still works, it just forgets the choice on reload.
  }
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test` (from `board-app/`)
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add board-app/src/lib/climberStorage.js board-app/src/lib/climberStorage.test.js
git commit -m "feat: add localStorage helper for the current climber selection"
```

---

### Task 3: `App.jsx` — climber picker header control

**Files:**
- Modify: `board-app/src/App.jsx`
- Modify: `board-app/src/App.test.jsx`

**Interfaces:**
- Consumes: `listClimbers`, `createClimber` from `./lib/board` (Task 1); `getStoredClimberId`, `setStoredClimberId` from `./lib/climberStorage` (Task 2).
- Produces: state `climbers`, `currentClimberId`, `showClimberPanel`; derived `currentClimber` (the climber object or `null`); handler `handleSelectClimber(id)`; setter `setShowClimberPanel`. Task 4 consumes all of these by exact name.
- This task only adds the header control itself (fetch roster, select, add, persist, restore on reload). It does **not** wire `setter` prefill, the send-log gate, attribution, or send-log display — that's Task 4.

This task edits `board-app/src/App.jsx` at seven exact locations. Each edit below shows the exact current text to find and the exact text to replace it with. Apply them in order; each "find" block is unique in the file.

- [ ] **Step 1: Write the failing tests**

In `board-app/src/App.test.jsx`, replace the `vi.mock('./lib/board', ...)` factory:

```jsx
vi.mock('./lib/board', () => ({
  getOrCreateBoard: vi.fn(),
  listProblems: vi.fn(),
  uploadBoardPhoto: vi.fn(),
  uploadProblemMask: vi.fn(),
  createProblem: vi.fn(),
  deleteProblem: vi.fn(),
  rateProblem: vi.fn(),
  updateProblem: vi.fn(),
  restoreProblem: vi.fn(),
  listTicks: vi.fn(),
  createTick: vi.fn(),
  deleteTick: vi.fn(),
}));
```

with:

```jsx
vi.mock('./lib/board', () => ({
  getOrCreateBoard: vi.fn(),
  listProblems: vi.fn(),
  uploadBoardPhoto: vi.fn(),
  uploadProblemMask: vi.fn(),
  createProblem: vi.fn(),
  deleteProblem: vi.fn(),
  rateProblem: vi.fn(),
  updateProblem: vi.fn(),
  restoreProblem: vi.fn(),
  listTicks: vi.fn(),
  createTick: vi.fn(),
  deleteTick: vi.fn(),
  listClimbers: vi.fn(),
  createClimber: vi.fn(),
}));
```

Replace the board import line:

```jsx
import { getOrCreateBoard, listProblems, uploadBoardPhoto, uploadProblemMask, createProblem, deleteProblem, rateProblem, updateProblem, restoreProblem, listTicks, createTick, deleteTick } from './lib/board';
```

with:

```jsx
import { getOrCreateBoard, listProblems, uploadBoardPhoto, uploadProblemMask, createProblem, deleteProblem, rateProblem, updateProblem, restoreProblem, listTicks, createTick, deleteTick, listClimbers, createClimber } from './lib/board';
```

Replace the top-level `beforeEach`:

```jsx
beforeEach(() => {
  vi.clearAllMocks();
  getOrCreateBoard.mockResolvedValue(BOARD);
  listProblems.mockResolvedValue([]);
  listTicks.mockResolvedValue([]);
  loadSegmenter.mockRejectedValue(new Error('segmentation unavailable in tests'));
});
```

with:

```jsx
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getOrCreateBoard.mockResolvedValue(BOARD);
  listProblems.mockResolvedValue([]);
  listTicks.mockResolvedValue([]);
  listClimbers.mockResolvedValue([]);
  loadSegmenter.mockRejectedValue(new Error('segmentation unavailable in tests'));
});
```

Append a new `describe` block at the end of the file:

```jsx
describe('App (climber picker)', () => {
  it('shows a prompt to pick a climber when none is selected', async () => {
    render(<App />);
    expect(await screen.findByText("Who's climbing?")).toBeInTheDocument();
  });

  it('lists fetched climbers in the panel and selects one', async () => {
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Alice' }, { id: 'c2', name: 'Bob' }]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Who's climbing?"));
    await user.click(await screen.findByText('Bob'));

    expect(await screen.findByText('You: Bob')).toBeInTheDocument();
    expect(localStorage.getItem('board-app:currentClimberId')).toBe('c2');
  });

  it('adds a new climber and selects it immediately', async () => {
    createClimber.mockResolvedValue({ id: 'c3', name: 'Charlie' });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Who's climbing?"));
    await user.type(screen.getByLabelText('New climber name'), 'Charlie');
    await user.click(screen.getByText('Add'));

    await waitFor(() => expect(createClimber).toHaveBeenCalledWith('Charlie'));
    expect(await screen.findByText('You: Charlie')).toBeInTheDocument();
  });

  it('restores a previously selected climber from localStorage on load', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Alice' }]);
    render(<App />);

    expect(await screen.findByText('You: Alice')).toBeInTheDocument();
  });

  it('ignores a stored climber id that no longer matches any fetched climber', async () => {
    localStorage.setItem('board-app:currentClimberId', 'ghost');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Alice' }]);
    render(<App />);

    expect(await screen.findByText("Who's climbing?")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test` (from `board-app/`)
Expected: FAIL — there's no climber picker in the header yet.

- [ ] **Step 3: Implement — apply these seven edits to `board-app/src/App.jsx`**

**Edit 1 of 7** — imports. Find:

```jsx
import { getOrCreateBoard, listProblems, uploadBoardPhoto, uploadProblemMask, createProblem, deleteProblem, rateProblem, updateProblem, restoreProblem, listTicks, createTick, deleteTick } from './lib/board';
import { resizeFileToBlob } from './lib/image';
```

Replace with:

```jsx
import { getOrCreateBoard, listProblems, uploadBoardPhoto, uploadProblemMask, createProblem, deleteProblem, rateProblem, updateProblem, restoreProblem, listTicks, createTick, deleteTick, listClimbers, createClimber } from './lib/board';
import { getStoredClimberId, setStoredClimberId } from './lib/climberStorage';
import { resizeFileToBlob } from './lib/image';
```

**Edit 2 of 7** — new helper component. Find:

```jsx
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: '#8b8d91', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  );
}

export default function App() {
```

Replace with:

```jsx
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: '#8b8d91', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  );
}

function ClimberPicker({ climbers, currentClimber, open, onToggle, newName, onNewNameChange, onAdd, onSelect, adding }) {
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
        color: '#c7c8cb', borderRadius: 20, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
      }}>
        {currentClimber ? `You: ${currentClimber.name}` : "Who's climbing?"}
      </button>
      {open && (
        <div style={{ marginTop: 8, background: '#232427', border: '1px solid #2A2B2E', borderRadius: 10, padding: 10 }}>
          {climbers.map((c) => (
            <button key={c.id} onClick={() => onSelect(c.id)} style={{
              display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
              color: '#EDEAE3', padding: '6px 4px', fontSize: 13.5, cursor: 'pointer',
            }}>{c.name}</button>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input
              aria-label="New climber name"
              value={newName}
              onChange={(e) => onNewNameChange(e.target.value)}
              placeholder="Add a climber"
              style={{ ...inputStyle, marginTop: 0, flex: 1 }}
            />
            <button onClick={onAdd} disabled={adding || !newName.trim()} style={{
              background: '#5C8A66', border: 'none', color: '#17181A', borderRadius: 8,
              padding: '0 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
```

**Edit 3 of 7** — new state. Find:

```jsx
  const [ticks, setTicks] = useState([]);
  const [showLogForm, setShowLogForm] = useState(false);
  const [tickDate, setTickDate] = useState('');
  const [tickNotes, setTickNotes] = useState('');
  const [loggingTick, setLoggingTick] = useState(false);

  const imgWrapRef = useRef(null);
```

Replace with:

```jsx
  const [ticks, setTicks] = useState([]);
  const [showLogForm, setShowLogForm] = useState(false);
  const [tickDate, setTickDate] = useState('');
  const [tickNotes, setTickNotes] = useState('');
  const [loggingTick, setLoggingTick] = useState(false);

  const [climbers, setClimbers] = useState([]);
  const [currentClimberId, setCurrentClimberId] = useState(null);
  const [showClimberPanel, setShowClimberPanel] = useState(false);
  const [newClimberName, setNewClimberName] = useState('');
  const [addingClimber, setAddingClimber] = useState(false);

  const imgWrapRef = useRef(null);
```

**Edit 4 of 7** — extend the initial load effect. Find:

```jsx
  useEffect(() => {
    (async () => {
      try {
        const b = await getOrCreateBoard();
        setBoard(b);
        const p = await listProblems(b.id);
        setProblems(p);
      } catch (e) {
        console.error(e);
        setError('Could not load the board — check your connection and try again.');
      }
      setLoading(false);
    })();
  }, []);
```

Replace with:

```jsx
  useEffect(() => {
    (async () => {
      try {
        const b = await getOrCreateBoard();
        setBoard(b);
        const p = await listProblems(b.id);
        setProblems(p);
        const c = await listClimbers();
        setClimbers(c);
        const storedId = getStoredClimberId();
        if (storedId && c.some((climber) => climber.id === storedId)) {
          setCurrentClimberId(storedId);
        }
      } catch (e) {
        console.error(e);
        setError('Could not load the board — check your connection and try again.');
      }
      setLoading(false);
    })();
  }, []);
```

**Edit 5 of 7** — new handlers. Find:

```jsx
    setUploading(false);
  };

  const handleImageClick = (e) => {
```

Replace with:

```jsx
    setUploading(false);
  };

  const handleSelectClimber = (id) => {
    setCurrentClimberId(id);
    setStoredClimberId(id);
    setShowClimberPanel(false);
  };

  const handleAddClimber = async () => {
    if (!newClimberName.trim()) return;
    setAddingClimber(true);
    setError('');
    try {
      const created = await createClimber(newClimberName);
      setClimbers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCurrentClimberId(created.id);
      setStoredClimberId(created.id);
      setNewClimberName('');
      setShowClimberPanel(false);
    } catch (err) {
      console.error(err);
      setError('Could not add that climber — check your connection and try again.');
    }
    setAddingClimber(false);
  };

  const handleImageClick = (e) => {
```

**Edit 6 of 7** — derived `currentClimber`. Find:

```jsx
  const selected = problems.find((p) => p.id === selectedId);
```

Replace with:

```jsx
  const currentClimber = climbers.find((c) => c.id === currentClimberId) || null;
  const selected = problems.find((p) => p.id === selectedId);
```

**Edit 7 of 7** — render the picker in the header. Find:

```jsx
          {view === 'list' && (
            <button onClick={startNewProblem} disabled={!board?.photo_url} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: board?.photo_url ? '#D9552B' : '#3a3b3e', color: '#17181A',
              border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 700, fontSize: 14, cursor: board?.photo_url ? 'pointer' : 'not-allowed',
            }}>
              <Plus size={16} /> New problem
            </button>
          )}
        </div>
      </div>
```

Replace with:

```jsx
          {view === 'list' && (
            <button onClick={startNewProblem} disabled={!board?.photo_url} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: board?.photo_url ? '#D9552B' : '#3a3b3e', color: '#17181A',
              border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 700, fontSize: 14, cursor: board?.photo_url ? 'pointer' : 'not-allowed',
            }}>
              <Plus size={16} /> New problem
            </button>
          )}
        </div>
        <ClimberPicker
          climbers={climbers}
          currentClimber={currentClimber}
          open={showClimberPanel}
          onToggle={() => setShowClimberPanel((prev) => !prev)}
          newName={newClimberName}
          onNewNameChange={setNewClimberName}
          onAdd={handleAddClimber}
          onSelect={handleSelectClimber}
          adding={addingClimber}
        />
      </div>
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test` (from `board-app/`)
Expected: PASS, all tests including the five new ones. (If any pre-existing test now fails because a stray climber panel is intercepting a click, re-check that Edit 7's `<ClimberPicker>` sits *after* the closing `</div>` of the title/button row, not inside it — the panel is closed by default so it should never interfere with existing interactions.)

- [ ] **Step 5: Commit**

```bash
git add board-app/src/App.jsx board-app/src/App.test.jsx
git commit -m "feat: add a climber picker to the header"
```

---

### Task 4: `App.jsx` — wire climber into setter prefill, send gating, and attribution

**Files:**
- Modify: `board-app/src/App.jsx`
- Modify: `board-app/src/App.test.jsx`

**Interfaces:**
- Consumes (from Task 3, exact names): state `currentClimber` (derived, object or `null`), `setShowClimberPanel`.
- Consumes (from Task 1): `createTick`'s `sentBy` param.
- No new exports — this task only edits existing behavior.

This task edits `board-app/src/App.jsx` at four exact locations, and modifies one existing test in `board-app/src/App.test.jsx`.

- [ ] **Step 1: Update and add tests**

In `board-app/src/App.test.jsx`, inside `describe('App (tick log flow)', ...)`, replace the existing test:

```jsx
  it('logs a send from the detail view', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], send_count: 0, last_sent_on: null },
    ]);
    createTick.mockResolvedValue({ id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: 'felt easy' });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Log a send'));
    fireEvent.change(screen.getByLabelText('Send date'), { target: { value: '2026-08-22' } });
    await user.type(screen.getByLabelText('Send notes'), 'felt easy');
    await user.click(screen.getByText('Save entry'));

    await waitFor(() =>
      expect(createTick).toHaveBeenCalledWith('p1', { sentOn: '2026-08-22', notes: 'felt easy' })
    );
    expect(await screen.findByText('Sent ×1')).toBeInTheDocument();
  });
```

with:

```jsx
  it('gates logging a send behind selecting a climber first', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: '', notes: '', holds: [], send_count: 0, last_sent_on: null },
    ]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Gaston Traverse'));

    expect(await screen.findByText('Select who you are to log a send')).toBeInTheDocument();
    expect(screen.queryByText('Log a send')).not.toBeInTheDocument();
  });

  it('logs a send attributed to the current climber', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: '', notes: '', holds: [], send_count: 0, last_sent_on: null },
    ]);
    createTick.mockResolvedValue({ id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: 'felt easy', sent_by: 'Rob' });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('You: Rob');
    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Log a send'));
    fireEvent.change(screen.getByLabelText('Send date'), { target: { value: '2026-08-22' } });
    await user.type(screen.getByLabelText('Send notes'), 'felt easy');
    await user.click(screen.getByText('Save entry'));

    await waitFor(() =>
      expect(createTick).toHaveBeenCalledWith('p1', { sentOn: '2026-08-22', notes: 'felt easy', sentBy: 'Rob' })
    );
    expect(await screen.findByText('Sent ×1')).toBeInTheDocument();
    expect(screen.getByText('Rob · 22 Aug 2026')).toBeInTheDocument();
  });

  it('shows a log entry with no name when sent_by is absent', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: '', notes: '', holds: [], send_count: 1, last_sent_on: '2026-08-01' },
    ]);
    listTicks.mockResolvedValue([{ id: 't1', problem_id: 'p1', sent_on: '2026-08-01', notes: '' }]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Gaston Traverse'));

    expect(await screen.findByText('1 Aug 2026')).toBeInTheDocument();
  });

  it('attributes sends correctly after switching to a different climber', async () => {
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }, { id: 'c2', name: 'Alex' }]);
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: '', notes: '', holds: [], send_count: 0, last_sent_on: null },
    ]);
    createTick
      .mockResolvedValueOnce({ id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: '', sent_by: 'Rob' })
      .mockResolvedValueOnce({ id: 't2', problem_id: 'p1', sent_on: '2026-08-23', notes: '', sent_by: 'Alex' });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Who's climbing?"));
    await user.click(await screen.findByText('Rob'));
    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Log a send'));
    fireEvent.change(screen.getByLabelText('Send date'), { target: { value: '2026-08-22' } });
    await user.click(screen.getByText('Save entry'));
    await waitFor(() =>
      expect(createTick).toHaveBeenCalledWith('p1', { sentOn: '2026-08-22', notes: '', sentBy: 'Rob' })
    );

    await user.click(screen.getByText('You: Rob'));
    await user.click(await screen.findByText('Alex'));
    await user.click(await screen.findByText('Log a send'));
    fireEvent.change(screen.getByLabelText('Send date'), { target: { value: '2026-08-23' } });
    await user.click(screen.getByText('Save entry'));
    await waitFor(() =>
      expect(createTick).toHaveBeenCalledWith('p1', { sentOn: '2026-08-23', notes: '', sentBy: 'Alex' })
    );

    expect(screen.getByText('Rob · 22 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('Alex · 23 Aug 2026')).toBeInTheDocument();
  });
```

Append one new test inside `describe('App (create flow)', ...)` (at the end of that block):

```jsx
  it('prefills the setter field with the current climber on a new problem', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('You: Rob');
    await user.click(screen.getByText('New problem'));

    expect(screen.getByPlaceholderText('Your name')).toHaveValue('Rob');
  });
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test` (from `board-app/`)
Expected: FAIL — the send-log button isn't gated yet, `createTick` isn't called with `sentBy`, the send log doesn't show a climber name, and `setter` isn't prefilled.

- [ ] **Step 3: Implement — apply these four edits to `board-app/src/App.jsx`**

**Edit 1 of 4** — prefill `setter` on a new problem. Find:

```jsx
  const startNewProblem = () => {
    setDraftHolds([]); setName(''); setGrade(''); setSetter(''); setNotes(''); setPlaceType('start');
    setEditingId(null);
    setError('');
    setView('new');
  };
```

Replace with:

```jsx
  const startNewProblem = () => {
    setDraftHolds([]); setName(''); setGrade(''); setSetter(currentClimber?.name || ''); setNotes(''); setPlaceType('start');
    setEditingId(null);
    setError('');
    setView('new');
  };
```

**Edit 2 of 4** — attribute the send. Find:

```jsx
  const handleAddTick = async (problemId) => {
    if (!tickDate) return;
    setLoggingTick(true);
    setError('');
    try {
      const created = await createTick(problemId, { sentOn: tickDate, notes: tickNotes });
```

Replace with:

```jsx
  const handleAddTick = async (problemId) => {
    if (!tickDate) return;
    setLoggingTick(true);
    setError('');
    try {
      const created = await createTick(problemId, { sentOn: tickDate, notes: tickNotes, sentBy: currentClimber?.name });
```

**Edit 3 of 4** — gate the log-send button behind a selected climber. Find:

```jsx
            <div style={{ marginTop: 16 }}>
              {!showLogForm ? (
                <button onClick={startLogTick} style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                  color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                }}><Plus size={14} /> Log a send</button>
              ) : (
```

Replace with:

```jsx
            <div style={{ marginTop: 16 }}>
              {!currentClimber ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#8b8d91' }}>Select who you are to log a send</span>
                  <button onClick={() => setShowClimberPanel(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                    color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  }}>Pick a climber</button>
                </div>
              ) : !showLogForm ? (
                <button onClick={startLogTick} style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                  color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                }}><Plus size={14} /> Log a send</button>
              ) : (
```

**Edit 4 of 4** — show the climber's name in the send log. Find:

```jsx
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{formatSendDate(t.sent_on)}</span>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                              color: t.id === firstSendId ? '#5C8A66' : '#8b8d91',
                            }}>{t.id === firstSendId ? 'First send' : 'Repeat'}</span>
                          </div>
```

Replace with:

```jsx
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>
                              {t.sent_by ? `${t.sent_by} · ${formatSendDate(t.sent_on)}` : formatSendDate(t.sent_on)}
                            </span>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                              color: t.id === firstSendId ? '#5C8A66' : '#8b8d91',
                            }}>{t.id === firstSendId ? 'First send' : 'Repeat'}</span>
                          </div>
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test` (from `board-app/`)
Expected: PASS, full suite green.

- [ ] **Step 5: Commit**

```bash
git add board-app/src/App.jsx board-app/src/App.test.jsx
git commit -m "feat: attribute logged sends to the selected climber"
```

---

### Task 5: Manual QA against the spec's acceptance criteria

**Files:** none (manual verification only, run against the deployed/dev app once the Supabase migration below has been applied).

**Interfaces:** none — this task consumes the finished feature from Tasks 1-4 end to end.

- [ ] **Step 1: Confirm the external SQL has been run**

Confirm with the user that this SQL (from the spec's "External setup step") has been run in the Supabase SQL Editor:

```sql
create table climbers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table ticks add column sent_by text;
```

If not yet run, stop here and ask the user to run it — the app will otherwise fail at runtime (though the automated test suite from Tasks 1-4 does not depend on it).

- [ ] **Step 2: Walk through the spec's acceptance criteria manually**

Run `npm run dev` (from `board-app/`) and verify, in a real browser, each of the six acceptance criteria listed in the spec's "Testing / acceptance criteria" section:
1. Fresh browser, no climber selected → header shows "Who's climbing?"; detail view shows the select-first prompt instead of "Log a send".
2. Adding a climber via the header panel immediately becomes current and survives a page reload.
3. Starting a new problem prefills `setter` with the current climber's name (still editable).
4. Logging a send as the current climber shows their name + date in the send log; `ticks.sent_by` is set in the database.
5. Switching to a second climber and logging another send on the same problem shows both entries with their own correct name.
6. A pre-existing tick with no `sent_by` still displays correctly, with no name shown.

- [ ] **Step 3: Report results**

No commit for this task — report pass/fail for each of the six criteria back to the user. Any failure here means returning to the relevant task (1-4) to fix, not proceeding to `finishing-a-development-branch`.

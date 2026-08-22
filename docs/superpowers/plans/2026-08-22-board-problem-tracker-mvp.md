# THE BOARD — Phase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the existing `window.storage`-backed React prototype to a Supabase-backed app ("THE BOARD"), and deploy it to Vercel.

**Architecture:** Vite + React SPA. No custom backend — the browser calls Supabase's REST API directly via `@supabase/supabase-js`. A small `src/lib/` layer isolates data access (`board.js`) and pure logic (`holds.js`, `image.js`) from the single-file `App.jsx` UI component, so both can be unit-tested without a live network connection or a real browser canvas.

**Tech Stack:** React 18, Vite, `@supabase/supabase-js`, `lucide-react`, Vitest + `@testing-library/react` for tests.

**Spec:** `docs/superpowers/specs/2026-08-22-board-problem-tracker-mvp-design.md`

## Global Constraints

- App lives in `board-app/` inside this git repo (repo root also holds `docs/`) — Vercel's project **Root Directory** must be set to `board-app`.
- No authentication. Row Level Security stays disabled on `boards`/`problems` so the anon key can read/write directly — this is an accepted tradeoff from the spec, not a gap to fix.
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, read via `import.meta.env`. `.env` is gitignored; `.env.example` is checked in blank.
- `App.jsx` stays a single file (plus the small `ChalkRing`/`Field` helper components already inside it) — do not split it further in Phase 1.
- Visual design is preserved verbatim from the prototype: `#17181A` charcoal background, `#D9552B` rust / `#5C8A66` green / `#EDEAE3` chalk hold colors, Bebas Neue display font, JetBrains Mono for grade tags and hold labels, dashed chalk-ring hold markers.
- Out of scope for this plan (see spec): `holds`/`problem_holds` tables, Roboflow detection, hold snapping, editing existing problems, sort/filter, tick log.

---

### Task 1: Scaffold the Vite app

**Files:**
- Create: `board-app/` (via Vite scaffold)
- Test: none (manual build check)

**Interfaces:**
- Produces: a working Vite + React project at `board-app/` that later tasks add `src/lib/*` and modify `src/App.jsx` / `src/index.css` inside.

- [ ] **Step 1: Scaffold the project**

```bash
npm create vite@latest board-app -- --template react
cd board-app
npm install
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build` (from `board-app/`)
Expected: build succeeds, `dist/` is created, no errors.

- [ ] **Step 3: Commit**

```bash
cd ..
git add board-app
git commit -m "chore: scaffold Vite + React app for THE BOARD"
```

---

### Task 2: `src/lib/holds.js` — tap coordinates and draft validation

**Files:**
- Create: `board-app/src/lib/holds.js`
- Test: `board-app/src/lib/holds.test.js`
- Modify: `board-app/vite.config.js` (add Vitest config)
- Create: `board-app/src/test/setup.js`
- Modify: `board-app/package.json` (add `test` script)

**Interfaces:**
- Produces: `pointFromClientCoords(rect, clientX, clientY) => { x: number, y: number }` (fractions 0–1), `validateDraft({ name, holds }) => string | null` (an error message, or `null` if valid).

- [ ] **Step 1: Install test tooling**

```bash
cd board-app
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Wire up Vitest**

Replace `board-app/vite.config.js` with:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
```

Create `board-app/src/test/setup.js`:

```js
import '@testing-library/jest-dom';
```

In `board-app/package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write the failing test**

Create `board-app/src/lib/holds.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { pointFromClientCoords, validateDraft } from './holds';

describe('pointFromClientCoords', () => {
  it('converts a click at the center of the image to {0.5, 0.5}', () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    expect(pointFromClientCoords(rect, 300, 150)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('converts a click at the top-left corner to {0, 0}', () => {
    const rect = { left: 0, top: 0, width: 400, height: 200 };
    expect(pointFromClientCoords(rect, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('validateDraft', () => {
  it('rejects a blank name', () => {
    expect(
      validateDraft({ name: '   ', holds: [{ x: 0.1, y: 0.1, type: 'hold' }] })
    ).toBe('Give the problem a name first.');
  });

  it('rejects zero holds', () => {
    expect(validateDraft({ name: 'Gaston Traverse', holds: [] })).toBe(
      'Tap the board to mark at least one hold.'
    );
  });

  it('accepts a name and at least one hold', () => {
    expect(
      validateDraft({ name: 'Gaston Traverse', holds: [{ x: 0.1, y: 0.1, type: 'hold' }] })
    ).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test, verify it fails**

Run: `npm test` (from `board-app/`)
Expected: FAIL — `Cannot find module './holds'` (or similar; the file doesn't exist yet).

- [ ] **Step 5: Implement**

Create `board-app/src/lib/holds.js`:

```js
export function pointFromClientCoords(rect, clientX, clientY) {
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

export function validateDraft({ name, holds }) {
  if (!name.trim()) return 'Give the problem a name first.';
  if (holds.length === 0) return 'Tap the board to mark at least one hold.';
  return null;
}
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `npm test`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add board-app/src/lib/holds.js board-app/src/lib/holds.test.js \
        board-app/src/test/setup.js board-app/vite.config.js board-app/package.json \
        board-app/package-lock.json
git commit -m "test: add holds.js coordinate and validation logic"
```

---

### Task 3: `src/lib/image.js` — photo resize

**Files:**
- Create: `board-app/src/lib/image.js`
- Test: `board-app/src/lib/image.test.js`

**Interfaces:**
- Produces: `computeScaledSize(width, height, maxWidth) => { width: number, height: number }`, `resizeFileToBlob(file, maxWidth = 1400, quality = 0.78) => Promise<Blob>`.
- Consumes: nothing from earlier tasks.

Note: `computeScaledSize` is pure and gets a real unit test. `resizeFileToBlob` is thin glue over `FileReader`/`Image`/`<canvas>`, which jsdom doesn't render — it is **not** unit tested here. It's exercised by the manual QA checklist in Task 9 (spec acceptance criterion 1: "Upload a board photo → it persists to Storage and renders").

- [ ] **Step 1: Write the failing test**

Create `board-app/src/lib/image.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { computeScaledSize } from './image';

describe('computeScaledSize', () => {
  it('leaves an image smaller than maxWidth unchanged', () => {
    expect(computeScaledSize(800, 600, 1400)).toEqual({ width: 800, height: 600 });
  });

  it('scales an image wider than maxWidth down, preserving aspect ratio', () => {
    expect(computeScaledSize(2800, 2100, 1400)).toEqual({ width: 1400, height: 1050 });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './image'`.

- [ ] **Step 3: Implement**

Create `board-app/src/lib/image.js`:

```js
export function computeScaledSize(width, height, maxWidth) {
  const scale = Math.min(1, maxWidth / width);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function resizeFileToBlob(file, maxWidth = 1400, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = computeScaledSize(img.width, img.height, maxWidth);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not create image blob'))),
          'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add board-app/src/lib/image.js board-app/src/lib/image.test.js
git commit -m "test: add image resize logic"
```

---

### Task 4: `src/lib/supabaseClient.js` — Supabase client + env config

**Files:**
- Create: `board-app/src/lib/supabaseClient.js`
- Test: `board-app/src/lib/supabaseClient.test.js`
- Create: `board-app/.env.example`
- Modify: `board-app/.gitignore`

**Interfaces:**
- Produces: `supabase` (named export) — a configured `@supabase/supabase-js` client.
- Consumes: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` from the environment.

- [ ] **Step 1: Install the Supabase client**

```bash
cd board-app
npm install @supabase/supabase-js
```

- [ ] **Step 2: Write the failing test**

Create `board-app/src/lib/supabaseClient.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('supabaseClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('throws a clear error when env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    await expect(import('./supabaseClient')).rejects.toThrow(/Missing VITE_SUPABASE_URL/);
  });

  it('creates a client when env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    const { supabase } = await import('./supabaseClient');
    expect(supabase.from).toBeInstanceOf(Function);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './supabaseClient'`.

- [ ] **Step 4: Implement**

Create `board-app/src/lib/supabaseClient.js`:

```js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

Create `board-app/.env.example`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Add to `board-app/.gitignore` (if not already covered):

```
.env
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm test`
Expected: PASS (9 tests total).

- [ ] **Step 6: Commit**

```bash
git add board-app/src/lib/supabaseClient.js board-app/src/lib/supabaseClient.test.js \
        board-app/.env.example board-app/.gitignore board-app/package.json board-app/package-lock.json
git commit -m "feat: add Supabase client with env var validation"
```

---

### Task 5: `src/lib/board.js` — data access layer

**Files:**
- Create: `board-app/src/lib/board.js`
- Test: `board-app/src/lib/board.test.js`

**Interfaces:**
- Consumes: `supabase` from `./supabaseClient` (Task 4).
- Produces:
  - `getOrCreateBoard() => Promise<{ id, name, photo_url, created_at }>`
  - `listProblems(boardId) => Promise<Array<{ id, board_id, name, grade, setter, notes, holds, created_at }>>`
  - `uploadBoardPhoto(boardId, blob) => Promise<board>` (blob is the output of `resizeFileToBlob` from Task 3)
  - `createProblem(boardId, { name, grade, setter, notes, holds }) => Promise<problem>`
  - `deleteProblem(id) => Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `board-app/src/lib/board.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock('./supabaseClient', () => ({ supabase: mocks.supabase }));

import {
  getOrCreateBoard,
  listProblems,
  uploadBoardPhoto,
  createProblem,
  deleteProblem,
} from './board';

function chain(result) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve) => resolve(result),
  };
  return builder;
}

beforeEach(() => {
  mocks.supabase.from.mockReset();
  mocks.supabase.storage.from.mockReset();
});

describe('getOrCreateBoard', () => {
  it('returns the existing board when one is found', async () => {
    const board = { id: 'b1', name: 'Home Board' };
    mocks.supabase.from.mockReturnValue(chain({ data: board, error: null }));
    const result = await getOrCreateBoard();
    expect(result).toEqual(board);
    expect(mocks.supabase.from).toHaveBeenCalledWith('boards');
  });

  it('creates a board named "Home Board" when none exists', async () => {
    const created = { id: 'b2', name: 'Home Board' };
    const selectChain = chain({ data: null, error: null });
    const insertChain = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValueOnce(selectChain).mockReturnValueOnce(insertChain);
    const result = await getOrCreateBoard();
    expect(result).toEqual(created);
    expect(insertChain.insert).toHaveBeenCalledWith({ name: 'Home Board' });
  });
});

describe('listProblems', () => {
  it('lists problems for a board, newest first', async () => {
    const rows = [{ id: 'p1' }, { id: 'p2' }];
    const c = chain({ data: rows, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await listProblems('b1');
    expect(result).toEqual(rows);
    expect(c.eq).toHaveBeenCalledWith('board_id', 'b1');
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});

describe('createProblem', () => {
  it('inserts a trimmed problem row scoped to the board', async () => {
    const saved = { id: 'p1', name: 'Gaston Traverse' };
    const c = chain({ data: saved, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await createProblem('b1', {
      name: '  Gaston Traverse  ',
      grade: ' V5 ',
      setter: ' Rob ',
      notes: ' beta ',
      holds: [{ x: 0.1, y: 0.2, type: 'start' }],
    });
    expect(result).toEqual(saved);
    expect(c.insert).toHaveBeenCalledWith({
      board_id: 'b1',
      name: 'Gaston Traverse',
      grade: 'V5',
      setter: 'Rob',
      notes: 'beta',
      holds: [{ x: 0.1, y: 0.2, type: 'start' }],
    });
  });
});

describe('deleteProblem', () => {
  it('deletes a problem by id', async () => {
    const c = chain({ data: null, error: null });
    mocks.supabase.from.mockReturnValue(c);
    await deleteProblem('p1');
    expect(c.delete).toHaveBeenCalled();
    expect(c.eq).toHaveBeenCalledWith('id', 'p1');
  });
});

describe('uploadBoardPhoto', () => {
  it('uploads the blob then stores the public url on the board', async () => {
    const storageBuilder = {
      upload: vi.fn(() => Promise.resolve({ error: null })),
      getPublicUrl: vi.fn(() => ({
        data: { publicUrl: 'https://cdn.example/board-photos/b1.jpg' },
      })),
    };
    mocks.supabase.storage.from.mockReturnValue(storageBuilder);
    const updateChain = chain({ data: { id: 'b1', photo_url: 'stored-url' }, error: null });
    mocks.supabase.from.mockReturnValue(updateChain);

    const blob = new Blob(['fake'], { type: 'image/jpeg' });
    const result = await uploadBoardPhoto('b1', blob);

    expect(storageBuilder.upload).toHaveBeenCalledWith('b1.jpg', blob, {
      upsert: true,
      contentType: 'image/jpeg',
    });
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        photo_url: expect.stringContaining('https://cdn.example/board-photos/b1.jpg'),
      })
    );
    expect(result).toEqual({ id: 'b1', photo_url: 'stored-url' });
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './board'`.

- [ ] **Step 3: Implement**

Create `board-app/src/lib/board.js`:

```js
import { supabase } from './supabaseClient';

export async function getOrCreateBoard() {
  const { data: existing, error: selectError } = await supabase
    .from('boards')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('boards')
    .insert({ name: 'Home Board' })
    .select()
    .single();
  if (insertError) throw insertError;
  return created;
}

export async function listProblems(boardId) {
  const { data, error } = await supabase
    .from('problems')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function uploadBoardPhoto(boardId, blob) {
  const path = `${boardId}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('board-photos')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from('board-photos').getPublicUrl(path);
  const photoUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

  const { data: updated, error: updateError } = await supabase
    .from('boards')
    .update({ photo_url: photoUrl })
    .eq('id', boardId)
    .select()
    .single();
  if (updateError) throw updateError;
  return updated;
}

export async function createProblem(boardId, { name, grade, setter, notes, holds }) {
  const { data, error } = await supabase
    .from('problems')
    .insert({
      board_id: boardId,
      name: name.trim(),
      grade: grade.trim(),
      setter: setter.trim(),
      notes: notes.trim(),
      holds,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProblem(id) {
  const { error } = await supabase.from('problems').delete().eq('id', id);
  if (error) throw error;
}
```

The `?t=${Date.now()}` cache-bust on the photo URL matters because uploads use `upsert: true` at a stable path (`${boardId}.jpg`) — without it, replacing the board photo could keep showing the old cached image.

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test`
Expected: PASS (16 tests total).

- [ ] **Step 5: Commit**

```bash
git add board-app/src/lib/board.js board-app/src/lib/board.test.js
git commit -m "feat: add Supabase data access layer for boards and problems"
```

---

### Task 6: `App.jsx` — bootstrap, photo upload, list + detail views

**Files:**
- Create: `board-app/src/App.jsx` (replaces the Vite scaffold default)
- Create: `board-app/src/App.test.jsx`
- Modify: `board-app/src/index.css`

**Interfaces:**
- Consumes: `getOrCreateBoard`, `listProblems`, `uploadBoardPhoto` from `./lib/board` (Task 5); `resizeFileToBlob` from `./lib/image` (Task 3).
- Produces: `App` (default export) — the root component, rendered by the untouched scaffold `main.jsx`.

This task covers the "read" paths only (viewing the board, browsing/opening problems). The "New problem" button and creation flow are added in Task 7; the delete button in Task 8.

- [ ] **Step 1: Remove Vite's default centering layout**

Replace `board-app/src/index.css` entirely with:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
}
```

(The default Vite template centers `#root` with padding and a max-width, which fights the full-bleed charcoal layout the design calls for.)

- [ ] **Step 2: Install icons**

```bash
cd board-app
npm install lucide-react
```

- [ ] **Step 3: Write the failing tests**

Create `board-app/src/App.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./lib/board', () => ({
  getOrCreateBoard: vi.fn(),
  listProblems: vi.fn(),
  uploadBoardPhoto: vi.fn(),
}));
vi.mock('./lib/image', () => ({
  resizeFileToBlob: vi.fn(),
}));

import { getOrCreateBoard, listProblems, uploadBoardPhoto } from './lib/board';
import { resizeFileToBlob } from './lib/image';
import App from './App';

const BOARD = { id: 'b1', name: 'Home Board', photo_url: null };

beforeEach(() => {
  vi.clearAllMocks();
  getOrCreateBoard.mockResolvedValue(BOARD);
  listProblems.mockResolvedValue([]);
});

describe('App (read paths)', () => {
  it('loads the board and shows the empty state when there are no problems', async () => {
    render(<App />);
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
    expect(
      screen.getByText('No problems set yet. Upload a photo and add your first one.')
    ).toBeInTheDocument();
    expect(getOrCreateBoard).toHaveBeenCalled();
    expect(listProblems).toHaveBeenCalledWith('b1');
  });

  it('lists problems returned from the server', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [] },
    ]);
    render(<App />);
    expect(await screen.findByText('Gaston Traverse')).toBeInTheDocument();
    expect(screen.getByText('V5')).toBeInTheDocument();
  });

  it('opens a problem detail view with its holds overlaid', async () => {
    listProblems.mockResolvedValue([
      {
        id: 'p1',
        name: 'Gaston Traverse',
        grade: 'V5',
        setter: 'Rob',
        notes: 'Match on the sloper',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }],
      },
    ]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Gaston Traverse'));
    expect(await screen.findByText('Match on the sloper')).toBeInTheDocument();
  });

  it('shows an error if the board fails to load', async () => {
    getOrCreateBoard.mockRejectedValue(new Error('network down'));
    render(<App />);
    expect(await screen.findByText(/Could not load the board/)).toBeInTheDocument();
  });

  it('uploads a resized photo and displays the returned url', async () => {
    const file = new File(['fake'], 'board.jpg', { type: 'image/jpeg' });
    const blob = new Blob(['resized'], { type: 'image/jpeg' });
    resizeFileToBlob.mockResolvedValue(blob);
    uploadBoardPhoto.mockResolvedValue({ ...BOARD, photo_url: 'https://cdn.example/b1.jpg' });

    render(<App />);
    const input = await screen.findByLabelText(/Upload a photo of your board/i);
    const user = userEvent.setup();
    await user.upload(input, file);

    expect(await screen.findByAltText('Climbing board')).toHaveAttribute(
      'src',
      'https://cdn.example/b1.jpg'
    );
    expect(uploadBoardPhoto).toHaveBeenCalledWith('b1', blob);
  });
});
```

- [ ] **Step 4: Run the tests, verify they fail**

Run: `npm test`
Expected: FAIL — the default scaffold `App.jsx` (Vite counter demo) doesn't render "THE BOARD" or any of the expected content.

- [ ] **Step 5: Implement**

Replace `board-app/src/App.jsx` entirely with:

```jsx
import { useState, useEffect } from 'react';
import { Camera, ChevronLeft, CircleDot, Loader2 } from 'lucide-react';
import { getOrCreateBoard, listProblems, uploadBoardPhoto } from './lib/board';
import { resizeFileToBlob } from './lib/image';

const HOLD_COLORS = {
  start: '#5C8A66',
  hold: '#EDEAE3',
  finish: '#D9552B',
};

function ChalkRing({ x, y, color, label, size = 34 }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        width: size,
        height: size,
        pointerEvents: 'none',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 40 40">
        <circle
          cx="20" cy="20" r="15"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray="4 3"
          strokeLinecap="round"
          transform="rotate(-12 20 20)"
        />
      </svg>
      {label ? (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color,
        }}>{label}</div>
      ) : null}
    </div>
  );
}

const fontImport = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
`;

export default function App() {
  const [board, setBoard] = useState(null);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | detail
  const [selectedId, setSelectedId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const b = await getOrCreateBoard();
        setBoard(b);
        const p = await listProblems(b.id);
        setProblems(p);
      } catch (e) {
        setError('Could not load the board — check your connection and try again.');
      }
      setLoading(false);
    })();
  }, []);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !board) return;
    setUploading(true);
    setError('');
    try {
      const blob = await resizeFileToBlob(file);
      const updated = await uploadBoardPhoto(board.id, blob);
      setBoard(updated);
    } catch (err) {
      setError('Could not upload that photo — try a different one.');
    }
    setUploading(false);
  };

  const selected = problems.find((p) => p.id === selectedId);
  const displayHolds = selected ? selected.holds : [];

  if (loading) {
    return (
      <div style={{ background: '#17181A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{fontImport}</style>
        <Loader2 className="animate-spin" color="#EDEAE3" size={28} />
      </div>
    );
  }

  return (
    <div style={{ background: '#17181A', minHeight: '100vh', fontFamily: "'Inter', sans-serif", color: '#EDEAE3' }}>
      <style>{fontImport}</style>

      <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid #2A2B2E', position: 'sticky', top: 0, background: '#17181Aee', backdropFilter: 'blur(6px)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {view === 'list' ? (
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 1.5, margin: 0, color: '#EDEAE3' }}>THE BOARD</h1>
          ) : (
            <button onClick={() => setView('list')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#C08552', fontFamily: "'Inter'", fontWeight: 600, fontSize: 15, cursor: 'pointer', padding: 0 }}>
              <ChevronLeft size={18} /> Board
            </button>
          )}
        </div>
        {view === 'list' && (
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8b8d91' }}>Shared with anyone who has this link.</p>
        )}
      </div>

      <div style={{ padding: 20, maxWidth: 640, margin: '0 auto' }}>
        <div style={{
          position: 'relative', width: '100%', borderRadius: 14, overflow: 'hidden',
          background: '#232427', border: '1px solid #2A2B2E', minHeight: board?.photo_url ? undefined : 220,
        }}>
          {board?.photo_url ? (
            <img src={board.photo_url} alt="Climbing board" style={{ width: '100%', display: 'block' }} draggable={false} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 10, color: '#6d6f73' }}>
              <Camera size={30} />
              <span style={{ fontSize: 13.5 }}>No board photo yet</span>
            </div>
          )}
          {displayHolds.map((h, i) => (
            <ChalkRing key={i} x={h.x} y={h.y} color={HOLD_COLORS[h.type]} label={h.type === 'hold' ? String(i + 1) : ''} />
          ))}
        </div>

        {view === 'list' && (
          <div style={{ marginTop: 12 }}>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              border: '1px dashed #3a3b3e', borderRadius: 10, padding: '10px 14px', fontSize: 13.5,
              color: '#a9abaf', cursor: 'pointer',
            }}>
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
              {board?.photo_url ? 'Replace board photo' : 'Upload a photo of your board'}
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} style={{ display: 'none' }} />
            </label>
          </div>
        )}

        {error && <p style={{ color: '#D9552B', fontSize: 13, marginTop: 10 }}>{error}</p>}

        {view === 'list' && (
          <div style={{ marginTop: 22 }}>
            {problems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#6d6f73' }}>
                <CircleDot size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p style={{ fontSize: 14, margin: 0 }}>No problems set yet. Upload a photo and add your first one.</p>
              </div>
            ) : problems.map((p) => (
              <button key={p.id} onClick={() => { setSelectedId(p.id); setView('detail'); }} style={{
                width: '100%', textAlign: 'left', background: '#232427', border: '1px solid #2A2B2E',
                borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', color: '#EDEAE3',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15.5 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#8b8d91', marginTop: 2 }}>{p.setter ? `Set by ${p.setter}` : 'Unknown setter'}</div>
                </div>
                {p.grade && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", background: '#17181A', border: '1px solid #3a3b3e', color: '#D9552B', fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 6 }}>{p.grade}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {view === 'detail' && selected && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 0.5, margin: 0 }}>{selected.name}</h2>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#8b8d91' }}>{selected.setter ? `Set by ${selected.setter}` : ''}</p>
              </div>
              {selected.grade && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", background: '#232427', border: '1px solid #3a3b3e', color: '#D9552B', fontSize: 14, fontWeight: 700, padding: '5px 12px', borderRadius: 6 }}>{selected.grade}</span>
              )}
            </div>
            {selected.notes && <p style={{ marginTop: 12, fontSize: 14, color: '#c7c8cb', lineHeight: 1.5 }}>{selected.notes}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests, verify they pass**

Run: `npm test`
Expected: PASS (21 tests total).

- [ ] **Step 7: Commit**

```bash
git add board-app/src/App.jsx board-app/src/App.test.jsx board-app/src/index.css \
        board-app/package.json board-app/package-lock.json
git commit -m "feat: port board bootstrap, photo upload, list and detail views to Supabase"
```

---

### Task 7: New-problem creation flow

**Files:**
- Modify: `board-app/src/App.jsx`
- Modify: `board-app/src/App.test.jsx`

**Interfaces:**
- Consumes: `pointFromClientCoords`, `validateDraft` from `./lib/holds` (Task 2); `createProblem` from `./lib/board` (Task 5).
- Modifies: `App` from Task 6 — adds the "New problem" button, tap-to-place, the form, and save.

- [ ] **Step 1: Add the new test cases**

Add `createProblem: vi.fn()` to the `vi.mock('./lib/board', ...)` factory at the top of `board-app/src/App.test.jsx`, add the import, and append these tests inside a new `describe` block:

```jsx
// add to the top-level mock:
vi.mock('./lib/board', () => ({
  getOrCreateBoard: vi.fn(),
  listProblems: vi.fn(),
  uploadBoardPhoto: vi.fn(),
  createProblem: vi.fn(),
}));

// add to the import line:
import { getOrCreateBoard, listProblems, uploadBoardPhoto, createProblem } from './lib/board';

// add near the top, alongside the other imports:
import { fireEvent, waitFor } from '@testing-library/react';

describe('App (create flow)', () => {
  it('places a hold on tap and saves a new problem', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    createProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: '', setter: '', notes: '',
      holds: [{ x: 0.5, y: 0.5, type: 'hold' }],
    });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100,
    });
    fireEvent.click(photo.parentElement, { clientX: 100, clientY: 50 });

    await user.type(await screen.findByPlaceholderText('e.g. Gaston Traverse'), 'Gaston Traverse');
    await user.click(screen.getByText('Save problem'));

    await waitFor(() =>
      expect(createProblem).toHaveBeenCalledWith('b1', {
        name: 'Gaston Traverse', grade: '', setter: '', notes: '',
        holds: [{ x: 0.5, y: 0.5, type: 'hold' }],
      })
    );
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
  });

  it('shows a validation error and does not save when no holds were placed', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('New problem'));
    await user.type(await screen.findByPlaceholderText('e.g. Gaston Traverse'), 'Gaston Traverse');
    await user.click(screen.getByText('Save problem'));

    expect(await screen.findByText('Tap the board to mark at least one hold.')).toBeInTheDocument();
    expect(createProblem).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test`
Expected: FAIL — there's no "New problem" button or form yet.

- [ ] **Step 3: Implement**

Replace `board-app/src/App.jsx` entirely with:

```jsx
import { useState, useEffect, useRef } from 'react';
import { Camera, Plus, ChevronLeft, Undo2, Check, CircleDot, Loader2 } from 'lucide-react';
import { getOrCreateBoard, listProblems, uploadBoardPhoto, createProblem } from './lib/board';
import { resizeFileToBlob } from './lib/image';
import { pointFromClientCoords, validateDraft } from './lib/holds';

const HOLD_COLORS = {
  start: '#5C8A66',
  hold: '#EDEAE3',
  finish: '#D9552B',
};

function ChalkRing({ x, y, color, label, size = 34 }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        width: size,
        height: size,
        pointerEvents: 'none',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 40 40">
        <circle
          cx="20" cy="20" r="15"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray="4 3"
          strokeLinecap="round"
          transform="rotate(-12 20 20)"
        />
      </svg>
      {label ? (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color,
        }}>{label}</div>
      ) : null}
    </div>
  );
}

const fontImport = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
`;

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: '#232427', border: '1px solid #3a3b3e',
  borderRadius: 8, padding: '10px 12px', color: '#EDEAE3', fontSize: 14.5, fontFamily: "'Inter'", marginTop: 4,
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: '#8b8d91', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  );
}

export default function App() {
  const [board, setBoard] = useState(null);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | new | detail
  const [selectedId, setSelectedId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [draftHolds, setDraftHolds] = useState([]);
  const [placeType, setPlaceType] = useState('hold');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [setter, setSetter] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const imgWrapRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const b = await getOrCreateBoard();
        setBoard(b);
        const p = await listProblems(b.id);
        setProblems(p);
      } catch (e) {
        setError('Could not load the board — check your connection and try again.');
      }
      setLoading(false);
    })();
  }, []);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !board) return;
    setUploading(true);
    setError('');
    try {
      const blob = await resizeFileToBlob(file);
      const updated = await uploadBoardPhoto(board.id, blob);
      setBoard(updated);
    } catch (err) {
      setError('Could not upload that photo — try a different one.');
    }
    setUploading(false);
  };

  const handleImageClick = (e) => {
    if (view !== 'new') return;
    const rect = imgWrapRef.current.getBoundingClientRect();
    const point = pointFromClientCoords(rect, e.clientX, e.clientY);
    setDraftHolds((prev) => [...prev, { ...point, type: placeType }]);
  };

  const startNewProblem = () => {
    setDraftHolds([]); setName(''); setGrade(''); setSetter(''); setNotes(''); setPlaceType('hold');
    setError('');
    setView('new');
  };

  const saveProblem = async () => {
    const validationError = validateDraft({ name, holds: draftHolds });
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError('');
    try {
      const problem = await createProblem(board.id, { name, grade, setter, notes, holds: draftHolds });
      setProblems((prev) => [problem, ...prev]);
      setView('list');
    } catch (err) {
      setError('Could not save that problem — check your connection and try again.');
    }
    setSaving(false);
  };

  const selected = problems.find((p) => p.id === selectedId);
  const displayHolds = view === 'new' ? draftHolds : (selected ? selected.holds : []);

  if (loading) {
    return (
      <div style={{ background: '#17181A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{fontImport}</style>
        <Loader2 className="animate-spin" color="#EDEAE3" size={28} />
      </div>
    );
  }

  return (
    <div style={{ background: '#17181A', minHeight: '100vh', fontFamily: "'Inter', sans-serif", color: '#EDEAE3' }}>
      <style>{fontImport}</style>

      <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid #2A2B2E', position: 'sticky', top: 0, background: '#17181Aee', backdropFilter: 'blur(6px)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {view === 'list' ? (
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 1.5, margin: 0, color: '#EDEAE3' }}>THE BOARD</h1>
          ) : (
            <button onClick={() => setView('list')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#C08552', fontFamily: "'Inter'", fontWeight: 600, fontSize: 15, cursor: 'pointer', padding: 0 }}>
              <ChevronLeft size={18} /> Board
            </button>
          )}
          {view === 'list' && (
            <button onClick={startNewProblem} disabled={!board?.photo_url} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: board?.photo_url ? '#D9552B' : '#3a3b3e', color: '#17181A',
              border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 700, fontSize: 14, cursor: board?.photo_url ? 'pointer' : 'not-allowed',
            }}>
              <Plus size={16} /> New problem
            </button>
          )}
        </div>
        {view === 'list' && (
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8b8d91' }}>Shared with anyone who has this link.</p>
        )}
      </div>

      <div style={{ padding: 20, maxWidth: 640, margin: '0 auto' }}>
        <div
          ref={imgWrapRef}
          onClick={handleImageClick}
          style={{
            position: 'relative', width: '100%', borderRadius: 14, overflow: 'hidden',
            background: '#232427', border: '1px solid #2A2B2E',
            cursor: view === 'new' ? 'crosshair' : 'default', minHeight: board?.photo_url ? undefined : 220,
          }}
        >
          {board?.photo_url ? (
            <img src={board.photo_url} alt="Climbing board" style={{ width: '100%', display: 'block' }} draggable={false} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 10, color: '#6d6f73' }}>
              <Camera size={30} />
              <span style={{ fontSize: 13.5 }}>No board photo yet</span>
            </div>
          )}
          {displayHolds.map((h, i) => (
            <ChalkRing key={i} x={h.x} y={h.y} color={HOLD_COLORS[h.type]} label={h.type === 'hold' ? String(i + 1) : ''} />
          ))}
        </div>

        {view === 'list' && (
          <div style={{ marginTop: 12 }}>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              border: '1px dashed #3a3b3e', borderRadius: 10, padding: '10px 14px', fontSize: 13.5,
              color: '#a9abaf', cursor: 'pointer',
            }}>
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
              {board?.photo_url ? 'Replace board photo' : 'Upload a photo of your board'}
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} style={{ display: 'none' }} />
            </label>
          </div>
        )}

        {error && <p style={{ color: '#D9552B', fontSize: 13, marginTop: 10 }}>{error}</p>}

        {view === 'new' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {['start', 'hold', 'finish'].map((t) => (
                <button key={t} onClick={() => setPlaceType(t)} style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: 0.5, border: `1.5px solid ${HOLD_COLORS[t]}`,
                  background: placeType === t ? HOLD_COLORS[t] : 'transparent',
                  color: placeType === t ? '#17181A' : HOLD_COLORS[t], cursor: 'pointer',
                }}>{t}</button>
              ))}
              <button onClick={() => setDraftHolds((d) => d.slice(0, -1))} disabled={!draftHolds.length} style={{
                width: 42, borderRadius: 8, border: '1.5px solid #3a3b3e', background: 'transparent',
                color: draftHolds.length ? '#EDEAE3' : '#4a4b4e', cursor: draftHolds.length ? 'pointer' : 'default',
              }}><Undo2 size={16} style={{ margin: '0 auto' }} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: '#8b8d91', marginTop: -6, marginBottom: 16 }}>Pick a hold type, then tap the board photo above to place it.</p>

            <Field label="Problem name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gaston Traverse" style={inputStyle} /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Grade"><input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="V5 / 6a+" style={inputStyle} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Set by"><input value={setter} onChange={(e) => setSetter(e.target.value)} placeholder="Your name" style={inputStyle} /></Field></div>
            </div>
            <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Beta, sequence, anything worth knowing" rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></Field>

            <button onClick={saveProblem} disabled={saving} style={{
              width: '100%', marginTop: 14, background: '#5C8A66', color: '#17181A', border: 'none',
              borderRadius: 10, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save problem
            </button>
          </div>
        )}

        {view === 'list' && (
          <div style={{ marginTop: 22 }}>
            {problems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#6d6f73' }}>
                <CircleDot size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p style={{ fontSize: 14, margin: 0 }}>No problems set yet. Upload a photo and add your first one.</p>
              </div>
            ) : problems.map((p) => (
              <button key={p.id} onClick={() => { setSelectedId(p.id); setView('detail'); }} style={{
                width: '100%', textAlign: 'left', background: '#232427', border: '1px solid #2A2B2E',
                borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', color: '#EDEAE3',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15.5 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#8b8d91', marginTop: 2 }}>{p.setter ? `Set by ${p.setter}` : 'Unknown setter'}</div>
                </div>
                {p.grade && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", background: '#17181A', border: '1px solid #3a3b3e', color: '#D9552B', fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 6 }}>{p.grade}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {view === 'detail' && selected && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 0.5, margin: 0 }}>{selected.name}</h2>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#8b8d91' }}>{selected.setter ? `Set by ${selected.setter}` : ''}</p>
              </div>
              {selected.grade && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", background: '#232427', border: '1px solid #3a3b3e', color: '#D9552B', fontSize: 14, fontWeight: 700, padding: '5px 12px', borderRadius: 6 }}>{selected.grade}</span>
              )}
            </div>
            {selected.notes && <p style={{ marginTop: 12, fontSize: 14, color: '#c7c8cb', lineHeight: 1.5 }}>{selected.notes}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test`
Expected: PASS (23 tests total).

- [ ] **Step 5: Commit**

```bash
git add board-app/src/App.jsx board-app/src/App.test.jsx
git commit -m "feat: add tap-to-place new-problem creation flow"
```

---

### Task 8: Delete flow

**Files:**
- Modify: `board-app/src/App.jsx`
- Modify: `board-app/src/App.test.jsx`

**Interfaces:**
- Consumes: `deleteProblem` from `./lib/board` (Task 5).
- Modifies: `App` from Task 7 — adds the delete button to the detail view.

- [ ] **Step 1: Add the new test case**

Add `deleteProblem: vi.fn()` to the `vi.mock('./lib/board', ...)` factory and its import in `board-app/src/App.test.jsx`, then append:

```jsx
// add to the mock factory:
vi.mock('./lib/board', () => ({
  getOrCreateBoard: vi.fn(),
  listProblems: vi.fn(),
  uploadBoardPhoto: vi.fn(),
  createProblem: vi.fn(),
  deleteProblem: vi.fn(),
}));

// add to the import line:
import { getOrCreateBoard, listProblems, uploadBoardPhoto, createProblem, deleteProblem } from './lib/board';

describe('App (delete flow)', () => {
  it('deletes a problem from the detail view', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [] },
    ]);
    deleteProblem.mockResolvedValue(undefined);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Delete problem'));

    await waitFor(() => expect(deleteProblem).toHaveBeenCalledWith('p1'));
    expect(
      await screen.findByText('No problems set yet. Upload a photo and add your first one.')
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test`
Expected: FAIL — there's no "Delete problem" button yet.

- [ ] **Step 3: Implement**

In `board-app/src/App.jsx`:

Add `Trash2` to the `lucide-react` import:

```js
import { Camera, Plus, ChevronLeft, Undo2, Check, Trash2, CircleDot, Loader2 } from 'lucide-react';
```

Add `deleteProblem` to the `./lib/board` import:

```js
import { getOrCreateBoard, listProblems, uploadBoardPhoto, createProblem, deleteProblem } from './lib/board';
```

Add this handler alongside `saveProblem`:

```jsx
const handleDelete = async (id) => {
  try {
    await deleteProblem(id);
    setProblems((prev) => prev.filter((p) => p.id !== id));
    setView('list');
  } catch (err) {
    setError('Could not delete that problem — check your connection and try again.');
  }
};
```

In the detail view block, after the `{selected.notes && ...}` line, add:

```jsx
<button onClick={() => handleDelete(selected.id)} style={{
  marginTop: 18, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
  color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
}}><Trash2 size={14} /> Delete problem</button>
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test`
Expected: PASS (24 tests total).

- [ ] **Step 5: Commit**

```bash
git add board-app/src/App.jsx board-app/src/App.test.jsx
git commit -m "feat: add delete problem flow"
```

---

### Task 9: External setup, deploy, and final QA

This task has two halves: steps only you can do (they need your Supabase/GitHub/Vercel logins), and steps the executor does once you hand back what's needed. It closes out the spec's acceptance criteria.

**Files:** none (infra/config only)

- [ ] **Step 1 (you): Supabase project, schema, storage bucket, local env**

Follow the spec's "External setup steps" 1–4 (`docs/superpowers/specs/2026-08-22-board-problem-tracker-mvp-design.md`):
1. Create a free Supabase project; copy the Project URL and `anon` key from Project Settings → API.
2. Run the `create table boards (...)` / `create table problems (...)` statements from the spec's Data Model section in the SQL Editor.
3. Storage → New bucket → name `board-photos` → toggle **Public bucket** on.
4. Copy `board-app/.env.example` to `board-app/.env` and fill in the two values from step 1.

- [ ] **Step 2 (you): Create the GitHub repo**

Create a new empty repository (no README/license, so there's no merge conflict with this history) and give the executor its remote URL (e.g. `git@github.com:you/board-app.git`).

- [ ] **Step 3 (executor): Verify the app builds against the real project**

Run: `cd board-app && npm run build`
Expected: build succeeds — confirms `.env` is filled in correctly (Task 4's `supabaseClient.js` throws immediately if the env vars are missing).

- [ ] **Step 4 (executor): Manual smoke test against the real Supabase project**

Run: `npm run dev` (from `board-app/`), open the printed local URL, and walk through the spec's acceptance criteria 1–5:
1. Upload a board photo (any placeholder image) → it persists to Storage and renders.
2. Create a problem: pick start/hold/finish, tap the photo to place each, fill in name/grade/setter/notes, save → appears in the list.
3. Open the problem's detail view → holds render as chalk-rings in the correct positions over the photo.
4. Delete the problem → removed from the list.
5. Refresh the browser → the board photo is still there (proves persistence, not just local React state).

- [ ] **Step 5 (executor): Push to GitHub**

```bash
git remote add origin <the-url-from-step-2>
git branch -M main
git push -u origin main
```

- [ ] **Step 6 (you): Deploy on Vercel**

Import the GitHub repo into Vercel. **Set the project's Root Directory to `board-app`** (the repo root also contains `docs/`, so Vercel won't find `package.json` at the top level otherwise). Framework preset: Vite. Add the same two environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the Vercel project settings. Deploy.

- [ ] **Step 7 (you + executor): Final cross-device check**

Repeat acceptance criteria 1–5 against the deployed Vercel URL from a phone, then open the same URL on a second device and confirm it shows the same board photo and problems — this proves the data is shared through Supabase, not stuck in one browser's local storage.

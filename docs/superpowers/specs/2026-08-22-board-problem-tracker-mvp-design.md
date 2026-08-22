# Board Problem Tracker — Phase 1 (MVP) Design

Date: 2026-08-22
Status: Approved, pending implementation

## Overview

A web app for tracking climbing "problems" (named routes) on a home
board. One board photo, holds placed as tap-coordinates, problems
shared via a public URL with no login. This spec covers **Phase 1
only**: a working, deployed MVP with manual hold placement. Automatic
hold detection (Roboflow) and relational hold storage are separate,
future specs — see "Explicitly deferred" below.

An existing React prototype (built as a Claude artifact against
`window.storage`) already implements the full UI and interaction
model: photo upload/resize, tap-to-place hold markers with
start/hold/finish types, chalk-ring markers, problem
create/list/detail/delete, and the dark-charcoal/rust visual design.
This spec covers **porting that prototype's persistence layer to
Supabase** and deploying it — the UI/interaction code is reused
essentially unchanged.

## Scope

**In scope (Phase 1):**
- Supabase Postgres schema: `boards`, `problems` (holds stored as JSON
  on the problem row — see Data Model)
- Supabase Storage for the board photo
- Port of the prototype's two `window.storage` calls to Supabase client
  calls
- Deployment to Vercel with environment-based Supabase config
- Manual QA on desktop and phone, including cross-device persistence

**Explicitly deferred (separate future specs):**
- `holds` / `problem_holds` normalized tables and hold-snapping
  (Phase 2, depends on Roboflow hold detection)
- Roboflow hosted inference integration
- Editing existing problems (create/delete only for now)
- Sort/filter by grade
- Ticked/ascent log
- Any authentication — this app is intentionally link-shared with no
  login, matching the existing prototype's model. This means the
  Supabase anon key (shipped in the client bundle) has full read/write
  access to both tables and the storage bucket. That's an accepted
  tradeoff for a small app shared with friends, not an oversight —
  revisit if abuse becomes a problem.

## Architecture

Vite + React SPA. No custom backend — the browser talks to Supabase's
auto-generated REST API directly via `@supabase/supabase-js`. One
implicit board: on mount, the app fetches the first row from `boards`,
creating one (`name: 'Home Board'`) if none exists yet, and scopes all
problem queries to that board's id.

## Data model (Phase 1)

```sql
create table boards (
  id uuid primary key default gen_random_uuid(),
  name text default 'Home Board',
  photo_url text,
  created_at timestamptz default now()
);

create table problems (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade,
  name text not null,
  grade text,
  setter text,
  notes text,
  holds jsonb not null, -- [{x: 0.42, y: 0.61, type: "start"|"hold"|"finish"}, ...]
  created_at timestamptz default now()
);
```

Row Level Security stays **disabled** on both tables (Supabase's
default for SQL-editor-created tables) so the anon key can read/write
directly — see the no-auth tradeoff noted above.

## File structure

```
board-app/
  src/
    lib/
      supabaseClient.js   -- creates the client from env vars
    App.jsx                -- ported BoardApp component (see below)
    main.jsx                -- Vite entry point
  .env                       -- gitignored, real keys
  .env.example                -- checked in, blank keys
```

`App.jsx` stays a single file, matching the prototype's existing
structure — it's already well-organized (one component, small
sub-components `ChalkRing` and `Field`, one style object). Splitting
it further is not justified by Phase 1's scope.

## Component adaptation (prototype → Supabase)

Everything visual/interactive in the prototype (tap-to-place, hold
type selector, chalk-ring rendering, list/detail views, form fields,
loading/error UI) carries over unchanged. Only the persistence calls
change:

1. **Load on mount** — replace the two `window.storage.get` calls
   with: fetch the first `boards` row (insert one if none exists), then
   `select * from problems where board_id = board.id order by
   created_at desc`.
2. **Photo upload** — keep the existing canvas-resize step, but have
   it produce a `Blob` (via `canvas.toBlob`) instead of a base64 data
   URL. Upload the blob to the `board-photos` storage bucket at path
   `${board.id}.jpg` with `upsert: true` (so re-uploading replaces the
   old photo), read back the public URL, and `update` `boards.photo_url`
   with it.
3. **Save problem** — replace the manual `Date.now()`-based id and
   `persistProblems` array rewrite with a single `insert` into
   `problems` (`board_id, name, grade, setter, notes, holds`), letting
   Postgres generate `id` and `created_at`. Prepend the returned row to
   local state (or refetch the list).
4. **Delete problem** — `delete from problems where id = ...`, then
   remove it from local state.
5. **Error handling** — unchanged pattern: wrap each call in try/catch
   and surface failures through the existing `setError(...)` state.

## Environment / configuration

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, read via
  `import.meta.env` in `src/lib/supabaseClient.js`.
- `.env` is gitignored; `.env.example` is checked in with blank values
  so the repo documents what's required without leaking keys.
- Same two variables get set again in the Vercel project's environment
  variable settings at deploy time.

## Testing / acceptance criteria

Local (`npm run dev`, against a real Supabase project, placeholder
image is fine):
1. Upload a board photo → it persists to Storage and renders.
2. Create a problem: pick start/hold/finish, tap the photo to place
   each, fill in name/grade/setter/notes, save → appears in the list.
3. Open the problem's detail view → holds render as chalk-rings in the
   correct positions over the photo.
4. Delete the problem → removed from list and from the `problems`
   table.
5. Refresh the browser → board photo and any remaining problems are
   still there (proves persistence, not just local React state).

Deployed (Vercel):
6. Repeat steps 1–5 against the deployed URL from a phone, and confirm
   a second device loading the same URL sees the same board/problems
   (proves it's shared state, not per-browser storage).

## External setup steps (performed by the user)

These require your own logins/credentials, so Claude Code will pause
and hand these off rather than run them:

1. **Supabase project** — create a free project at supabase.com. From
   Project Settings → API, copy the Project URL and the `anon` public
   key.
2. **Schema** — open the SQL Editor and run the `create table`
   statements from the Data Model section above.
3. **Storage bucket** — Storage → New bucket → name it `board-photos`
   → toggle **Public bucket** on (needed for `getPublicUrl` to work
   without signed URLs).
4. **Local env** — copy `.env.example` to `.env` and fill in the URL
   and anon key from step 1.
5. **GitHub repo** — create a new empty repo for this project; Claude
   Code will push to it once the app is scaffolded.
6. **Vercel** — import the GitHub repo, framework preset "Vite", add
   the same two environment variables in the Vercel project settings,
   deploy.

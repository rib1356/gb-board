# Climber Profiles & Send Attribution — Design

Date: 2026-09-15
Status: Approved, pending implementation

## Overview

The board is used by more than one climber. This adds a lightweight,
no-auth "who am I on this device" concept: a shared roster of climber
names anyone can add to, a per-browser remembered selection, and two
places that roster feeds into — prefilling the `setter` field on a new
problem, and attributing each logged send to whoever logged it.

This is intentionally **not** an accounts/login system — no passwords,
no per-climber data isolation, nothing enforced server-side. Anyone
can still pick any name, same as anyone can already type any name into
`setter` today. It's a convenience layer, not a security boundary,
consistent with the app's existing no-auth design (see the Phase 1
spec's accepted tradeoff on the anon key).

## Scope

**In scope:**
- `climbers` table: a shared, flat list of names.
- A persistent header control showing the current device's selected
  climber, with an inline panel to switch to an existing one or add
  a new one.
- The selection is remembered via `localStorage` on that browser only
  — the roster itself is shared (Supabase-backed), the selection isn't.
- `setter` prefill on `startNewProblem` from the current climber.
- Send logging requires a climber to be selected on this device;
  each tick stores the climber's name as a text snapshot at log time.
- Displaying who logged each send in the send log list.

**Explicitly out of scope:**
- Editing or deleting a climber (add-only for now; if a name is wrong,
  add a corrected one — cleanup is a manual SQL job for now, not UI).
- Linking `sent_by` back to a `climbers` row via foreign key — it's a
  plain text snapshot (see Decision below), so renaming or removing a
  climber later does not retroactively change past logs.
- Making `setter` a strict picker — it stays free text, just prefilled.
- Any authentication, per-climber permissions, or server-side
  enforcement of "required" — that's a client-side UX gate only
  (button disabled), not a real constraint; the anon key can still
  write a tick with any or no `sent_by` value directly.
- Backfilling `sent_by` on existing ticks — they just display with no
  name, same as they do today with no date-only display.

## Decision: text snapshot, not a foreign key

`ticks.sent_by` is a plain `text` column, not `climber_id uuid
references climbers(id)`. This matches how `setter` already works
(free text, not linked to anything), keeps the query/join surface flat
for what's still a very small personal app, and means a send log stays
historically accurate even if a climber is later renamed or removed —
exactly what "log" implies. The tradeoff is that renaming a climber
does not update their past logs; that's accepted as correct behavior
here, not a limitation.

## Data model

```sql
create table climbers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table ticks add column sent_by text;
```

No `board_id` scoping on `climbers` — this app only ever has one
board, same reasoning as the rest of the schema. `sent_by` is
nullable: existing ticks keep working with no attribution, and the
column is only ever populated by the app's own "required" UX gate, not
enforced by the database.

Row Level Security stays disabled on `climbers`, consistent with every
other table.

## API additions (`src/lib/board.js`)

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

`createTick` gains an optional `sentBy` param, written straight
through to `sent_by` (mirrors the existing `notes`/`sentOn` params):

```js
export async function createTick(problemId, { sentOn, notes, sentBy }) {
  const { data, error } = await supabase
    .from('ticks')
    .insert({ problem_id: problemId, sent_on: sentOn, notes: notes.trim(), sent_by: sentBy })
    .select()
    .single();
  ...
}
```

## Client-side persistence

`localStorage` key `board-app:currentClimberId`, holding just the
climber's `id`. On load (once `climbers` has been fetched), if the
stored id matches a row in the fetched list, that climber becomes
`currentClimber` for this session; if it doesn't match anything (never
set, or that climber no longer exists), there's no current climber.
Selecting or creating a climber writes the new id to `localStorage`
immediately. Wrapped in try/catch same as any other browser-storage
read, in case it's unavailable (private browsing, quota) — falls back
to no climber selected rather than crashing.

## UI

**Header control** — a small pill in a new row directly under the
existing title/back-button row, visible on every view (not just
list), reading `You: <name>` or `Who's climbing?` if none selected.
Clicking it toggles an inline panel (same "toggle a bit of local
state" pattern as the tick-log form) listing existing climbers as
tappable rows, plus a name field + "Add" button that creates and
immediately selects a new climber. "Add" is disabled while the field
is blank, same as other forms in the app gate their submit button on
required input. No modal/overlay — matches the app's existing
inline-panel style.

**Setter prefill** — `startNewProblem` sets `setSetter(currentClimber?.name || '')`
instead of always `''`. Still a plain editable text input.

**Log a send, gated** — in the detail view, where the "Log a send"
button currently always renders: if no `currentClimber`, render a
short prompt ("Select who you are to log a send") plus a button that
opens the same header picker panel, instead of the button. Once a
climber is selected, behavior is exactly as today, except
`handleAddTick` passes `sentBy: currentClimber.name` through to
`createTick`.

**Send log display** — each entry's existing date/first-send-or-repeat
row gains the climber's name (from `t.sent_by`) when present, e.g.
`Rob · 12 Sep 2026`. Entries with no `sent_by` (pre-existing or logged
before a climber was selected) show exactly as they do today.

## Testing / acceptance criteria

1. Fresh browser, no climber selected: header shows "Who's climbing?";
   detail view's "Log a send" area shows the select-first prompt
   instead of the log button.
2. Add a new climber via the header panel → immediately becomes the
   current climber, persists across a page reload (localStorage).
3. Start a new problem → `setter` field is prefilled with the current
   climber's name, still editable.
4. Log a send as the current climber → entry appears in the send log
   showing their name and the date; `ticks.sent_by` is set in the DB.
5. Switch to a second (newly added) climber via the header panel, log
   another send on the same problem → both entries show their own
   correct name.
6. An existing tick logged before this feature (no `sent_by`) still
   displays correctly, with no name shown.

## External setup step (performed by the user)

Run in the Supabase SQL Editor:

```sql
create table climbers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table ticks add column sent_by text;
```

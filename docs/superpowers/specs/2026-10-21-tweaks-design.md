# Tweaks (private injury log) — Design

**Date:** 2026-10-21
**Status:** Agreed in brainstorming, builder-checked, awaiting Rob's review

## Why

Rob keeps an injury log in a Google Doc. Each injury gets its own table, with
a row per day for the date, a pain score and a few sentences of notes. Adding
a row on a phone is fiddly, so the logs die once an injury stops really
hurting, and the quiet "it's fine now" days are exactly the ones worth having.
He checks in at random times: first thing in the morning, after a session, or
at the end of the day.

The log will live in THE BOARD because the app is already on his phone and
already hosted. It's small and used now and then, so a separate app,
database and hosting isn't worth it. But the board is open to the crew, and
the repo and the JS bundle are public, while the notes are personal (physio
opinions, how training's going). So the log sits behind a real login, not
just a hidden button.

The board-photo and volumes buttons move in there too, because re-shooting
the board and marking volumes are Rob's jobs.

## Goals

- Check in on an open injury in a few taps, at any time of day.
- Start a new injury log quickly, and notice when the same finger comes back.
- See an injury's whole story: pain over time and every check-in.
- Bring over every log from the Google Doc.
- Injury data can only be read or written by Rob's login, never with the
  public anon key.
- Board setup (new photo, volumes) only shows behind the login.

## Non-goals

- Logins for anyone else. This is one person's area.
- Rehab plans, exercise tracking, reminders, notifications, export.
- Photos on injuries.
- A workout logger.

## Anti-goals

These would count as failures even if everything technically worked:

- **Anything changes for the crew.** That includes a login prompt, a visible
  lock icon, a slower app or a broken send log.
- **Personal notes end up somewhere public**: in the repo, the bundle, or
  readable with the anon key.
- **Checking in feels like filling in a form.** If it's slower than the doc,
  it's failed.
- **Forcing precision Rob doesn't have.** He writes pain as ranges ("1-1.5"),
  with a spike after a session ("3-4 / 7") or a question mark, and start
  dates like "around the end of June". Whole-number pain scores and exact
  start dates would lose that.

## Privacy in this repo

The repo is public. This spec, the plan and the test fixtures use made-up
examples only. Rob's real notes and the row-by-row import details stay in
`.superpowers/tweaks/`, which git ignores.

## Mockups

Agreed mockups are in `.superpowers/brainstorm/23532-1792613132/content/`
(`flow.html`, `new-injury.html`), which git ignores. They say "Back room",
which has since been renamed **Tweaks**. They also contain Rob's real notes,
so they must stay out of the repo.

## The calls Claude made

Rob didn't specify these, so they're worth checking:

- The sign-in account uses a made-up email, not Rob's real one.
- Uploading a new board photo goes back to the board list so you see it.
- The empty hub reads "Nothing tweaky. Long may it last."
- For an open injury, the chart runs to today, so a gap since the last
  check-in shows.
- A new check-in starts at the last pain score. Board is pre-ticked if Rob
  has board sends that day.
- In the check-in sheet, changing the date moves the check-in. Picking a date
  that already has one adds to it, and nothing is dropped.
- Unsaved check-ins are kept as a draft on the phone until saved, discarded
  or signed out.
- Imported check-ins have no activity chips.
- The builder never signs in or writes test data. Signed-in checks are on
  Rob's phone checklist.

## Decisions

| Question | Decision |
|---|---|
| Name | **TWEAKS** (screen title) |
| Way in | Long-press the THE BOARD heading on the list screen |
| Lock | Supabase Auth with one account and sign-ups switched off. The injury tables have row-level security limited to that account's user id |
| Where the password lives | In Supabase (changeable in the dashboard), never in code |
| Account email | A made-up address baked into the app, not Rob's real email, because the bundle is public *(my call)* |
| Staying signed in | Yes, on each device until he signs out |
| Crew experience | Unchanged |
| Board setup | The photo and volume buttons move into Tweaks. The board list keeps its "Upload a photo of your board" prompt only while the board has no photo |
| Board setup lock | The buttons are hidden, but they still write through the open anon client. That's tidying, not a lock, and Rob agreed to it |
| History | Every Google Doc log is imported |
| Pain | A range from 0 to 10 in half steps, with an optional spike |
| Several check-ins on one day | The UI keeps one per date. Opening a date that already has a check-in edits it |

## Getting in

### The door

- A long-press (about 600 ms) on the THE BOARD heading in the list view opens
  Tweaks. It must work with both touch and mouse. Moving more than about
  10 px, or letting go early, cancels it, so scrolling and taps behave as now.
- The heading shows no sign of this: no cursor change, no hint, no animation.
  Suppress iOS text selection and the callout menu on it (`user-select: none`,
  `-webkit-touch-callout: none`).
- **Signed in on this device:** go straight to Tweaks.
- **Not signed in:** a bottom sheet slides up with the title "Tweaks", a
  password field and an Unlock button. The field is `type="password"`,
  autofocused, with `autocomplete="current-password"` so iOS Keychain can
  fill it.
  - A wrong password shows "That's not it." under the field.
  - A network failure shows "Couldn't reach the server — try again."
  - Tapping outside the sheet closes it.
- A Sign out button at the bottom of Tweaks signs out and goes back to the
  board list.

### The account

- Rob creates one user in the Supabase dashboard (Authentication → Users →
  Add user → Create new user, auto-confirmed), using the made-up email and a
  password he chooses. He then switches off "Allow new users to sign up".
- The app signs in with
  `signInWithPassword({ email: TWEAKS_EMAIL, password })`. The email is a
  constant in the code; something like `tweaks@example.com` is fine, since
  `example.com` is reserved and never receives mail.
- Tweaks uses **its own Supabase client** with its own `auth.storageKey`.
  Signing in must never change the main client. The board, sends and climbers
  keep going through the anon role exactly as they do today, even on Rob's
  phone while he's signed in. A separate storage key also avoids supabase-js's
  "multiple GoTrueClient instances" warning.
- supabase-js keeps the session in localStorage and refreshes it
  automatically. If a session has expired or been revoked, treat the device
  as signed out and show the password sheet.
- An iPhone home-screen web app keeps its storage separate from Safari, so
  Rob signs in once in each. That's expected.
- The sign-in endpoint is public, so the password should be longer than a
  PIN. Supabase rate-limits sign-in attempts.
- This account is a user inside the project's database. It's separate from
  Rob's own supabase.com login, which nothing here touches. The dashboard's
  Table Editor and SQL editor still see the injury tables, because they run
  as the admin and skip RLS.
- **Forgotten password:** a reset email can't reach a made-up address.
  Instead, run this in the SQL editor:
  ```sql
  update auth.users set encrypted_password = extensions.crypt('<new password>', extensions.gen_salt('bf'))
  where email = '<TWEAKS_EMAIL>';
  ```

### Board setup moves

- Remove `canSetUpBoard` and the "pick Rob to see the buttons" rule. The
  board list shows "Upload a photo of your board" only when the board has no
  photo yet, so first-time setup is unchanged.
- Tweaks gets a **Board setup** section with two buttons:
  - **New photo** uses the same file input and `handlePhotoUpload`. Once the
    upload finishes, go back to the board list so the new photo is on screen
    *(my call)*.
  - **Volumes** opens the existing volumes screen, and that screen's back
    link returns to Tweaks.
- `BOARD_OWNER` (`'Rob'`) stays. It's still used to find Rob's board
  sessions for the chart (see Injury page).

## Data

There are two new tables. Both have row-level security on, with a policy that
only allows Rob's user id. Both are granted to `authenticated` only, with
nothing for `anon`.

This is the opposite of every other table in this project, which runs with
RLS off and full anon grants. Don't copy the usual "disable RLS + grant to
anon" snippet here.

```sql
create table injuries (
  id uuid primary key default gen_random_uuid(),
  side text not null check (side in ('left', 'right', 'none')),
  area text not null check (area in ('finger', 'wrist', 'elbow', 'shoulder', 'back', 'knee', 'other')),
  finger text check (finger in ('thumb', 'index', 'middle', 'ring', 'little')),
  area_other text,                       -- the "Where?" text when area = 'other'
  what text,                             -- e.g. "A2 pulley?", free text
  symptoms text,
  started_on date,                       -- null = not known
  started_roughly boolean not null default false,
  how_it_happened text,
  closed_on date,                        -- null = open
  created_at timestamptz not null default now(),
  check ((area = 'finger') = (finger is not null)),
  check ((area = 'other') = (area_other is not null))
);

create table injury_checkins (
  id uuid primary key default gen_random_uuid(),
  injury_id uuid not null references injuries(id) on delete cascade,
  checked_on date not null,
  pain_low numeric(3,1) not null check (pain_low between 0 and 10 and pain_low * 2 = round(pain_low * 2)),
  pain_high numeric(3,1) not null check (pain_high between pain_low and 10 and pain_high * 2 = round(pain_high * 2)),
  pain_peak numeric(3,1) check (pain_peak between pain_high and 10 and pain_peak * 2 = round(pain_peak * 2)),
  activities text[] not null default '{}'
    check (activities <@ array['board', 'indoor', 'outside', 'fingerboard', 'rest', 'taped']),
  notes text,
  created_at timestamptz not null default now()
);
create index on injury_checkins (injury_id, checked_on);

alter table injuries enable row level security;
alter table injury_checkins enable row level security;
revoke all on injuries, injury_checkins from anon;
grant select, insert, update, delete on injuries, injury_checkins to authenticated;

do $$
declare rob uuid := (select id from auth.users where email = 'tweaks@example.com');
begin
  if rob is null then
    raise exception 'Create the tweaks@example.com user in Authentication first';
  end if;
  execute format('create policy "Rob only" on injuries for all to authenticated using (auth.uid() = %L) with check (auth.uid() = %L)', rob, rob);
  execute format('create policy "Rob only" on injury_checkins for all to authenticated using (auth.uid() = %L) with check (auth.uid() = %L)', rob, rob);
end $$;
```

- The policies look Rob's user id up from `tweaks@example.com`, so nobody
  pastes an id. The SQL raises if that user doesn't exist yet. Run it as
  one transaction (`begin; … commit;`) so a failed run leaves nothing
  behind. The same SQL, with `begin`/`commit`, is in the MVP spec.
- There's deliberately no unique constraint on `(injury_id, checked_on)`. The
  imported history has one day with two entries. The UI still treats a date
  as a single check-in: it opens the most recently created one.
- The full schema SQL in `2026-08-22-board-problem-tracker-mvp-design.md`
  needs these tables added (the policy looks the id up, so there's no placeholder).
- The SQL goes to Rob **in the chat**, in order, as steps he has to do. It
  must not only live in a spec.
- After he runs it, a probe with the anon key from `board-app/.env` should get
  "permission denied" when selecting from `injuries`. That proves the lock
  works.

## Screens

New `view` values in `App.jsx`: `tweaks`, `injury`, `injury-new` and
`injury-edit`. Code goes in `src/tweaks/` (like `warmup/` and `logbook/`),
with data access in `src/lib/tweaks.js` and pure helpers that have their own
tests. New views use `leaveFor` and the existing scroll-restore behaviour.

### Injury titles

The title is built from side, area and finger:

| Data | Title |
|---|---|
| finger, right, middle | RH middle finger |
| finger, left, thumb | LH thumb |
| finger, none, ring | Ring finger |
| wrist, left | L wrist |
| shoulder, right | R shoulder |
| back, none | Back |
| other, right, "hip" | R hip |

Titles are uppercase Bebas on the injury page and sentence case in lists.

### Tweaks (the hub)

- The header has "‹ Board" and the title TWEAKS.
- **Open injuries** (no `closed_on`) come first. Each is a card showing:
  - the title and `what`;
  - "open since" the start date, or the first check-in if there's no start
    date;
  - one of "Last check-in 3 Oct, 5 days ago", "Checked in today" or "No
    check-ins yet";
  - a big **Check in** button, which opens the check-in sheet for today.
    Tapping anywhere else on the card opens the injury page.
- **Injury log** lists the closed injuries, newest first by start date
  (falling back to the first check-in, then `created_at`). Each row shows the
  title, `what` and a month and year ("Mar 25"). Tapping a row opens the
  injury page.
- A **+ New injury** link.
- **Board setup**, as above.
- **Sign out.**
- With no injuries yet, the open section reads "Nothing tweaky. Long may it
  last." *(my call)*

### Injury page

- The header has "‹ Tweaks", an Open/Closed badge and an Edit link.
- Below it: the title, `what` and a start line. The start line reads
  "Started 4 Mar 2026", "Started around 4 Mar 2026" or "Started: not sure".
  Symptoms and how it happened sit behind a "more" tap.
- **Pain chart**, shown once there are at least two check-ins:
  - It's a hand-drawn SVG in the same style as `WeekCharts` (no chart
    library).
  - The x-axis runs from the first check-in to the last. For an open
    injury it runs to today instead, so a gap since the last check-in is
    visible *(my call)*.
  - The y-axis runs from 0 to the greater of 5 and the highest high or peak,
    rounded up.
  - The low–high range is drawn as a shaded band, with a line through the
    midpoints and each peak as a dot.
  - Under the axis, small dots mark the days Rob sent anything on the board.
    These are the `boardTicks` already loaded, filtered to
    `sent_by === BOARD_OWNER`.
- **Same spot before** links to other injuries with the same side and area
  (and finger, for fingers).
- **Check-ins**, newest first. Each shows:
  - the date ("Tue 13 Oct", plus the year when it isn't the current year);
  - the pain ("1", "1–2" or "3–4 / 7");
  - activity tags;
  - the **full** notes. Reading the story is the point, so don't cut them
    off.

  Tapping a check-in opens it in the sheet for editing.
- **Check in** is a sticky button at the bottom for open injuries. A closed
  injury shows **Reopen** there instead, which clears `closed_on`.
- **Close this log** sits at the bottom of an open injury. It sets
  `closed_on` to today with no confirmation, since Reopen undoes it.

### Check-in sheet

- It opens as a bottom sheet over the hub or the injury page.
- The top shows the injury title and the date ("Today, Wed 21 Oct"). Tapping
  the date opens a native date input.
- **The date belongs to the check-in being written** *(my call)*:
  - **Editing an existing check-in:** changing the date moves that check-in
    to the new date. That's how a wrong date gets fixed.
  - **New check-in, nothing touched yet:** picking a date that already has a
    check-in loads that check-in for editing.
  - **New check-in after typing or moving the slider:** picking a date that
    already has a check-in shows "There's already a check-in on 13 Oct —
    saving adds to it." Saving then merges into that check-in: the notes go
    on the end after a blank line, the pain takes the sheet's values, and the
    activities are combined. Nothing typed is dropped.
- **Pain:**
  - A two-thumb slider from 0 to 10 in 0.5 steps, with a big readout ("1 – 2",
    or "1" when both ends match).
  - When the thumbs sit on top of each other, dragging up moves the high end
    and dragging down moves the low end.
  - A new check-in starts at the previous check-in's low and high, so an
    unchanged day is a single tap on Save. The very first check-in starts at
    0, and Save stays disabled until the slider is touched *(my call)*.
  - "+ Add a spike" shows a single slider for the peak, which can't go below
    the high end. It can be removed again.
- **What you did** is optional. The chips are Board, Climbed inside, Outside,
  Fingerboard, Rest day and Taped, and any number can be picked. For a new
  check-in, Board is pre-ticked if Rob has board sends on that date
  *(my call)*.
- **How's it feeling?** is a textarea that grows as you type. It's the main
  field.
- **Save.** When editing, there's also Delete, with an inline confirmation.
- **Same day:** if the date already has a check-in, the sheet opens it for
  editing with the cursor at the end of the notes, ready to add to them.
- If saving fails, the sheet stays open with everything typed still there,
  and shows an error. Typed notes must never be lost.
- **Drafts** *(my call)*: while the sheet has unsaved changes, they're kept
  on the device in localStorage, one draft per injury. That covers tapping
  outside the sheet and iOS reloading the home-screen app partway through a
  note. Opening the sheet again for that injury restores the draft. The
  draft is cleared when it's saved, when Rob taps Discard, and on sign-out.
  It lives only on Rob's own phone, alongside the session that can already
  read the notes anyway.

### New injury and edit

These follow `new-injury.html`.

- **Side** chips: Left, Right, and Both / n/a (stored as `none`).
- **Where** chips: Finger, Wrist, Elbow, Shoulder, Back, Knee and Other.
  - Finger shows **Which finger** chips: Thumb, Index, Middle, Ring, Little.
  - Other shows a "Where?" text field.
- A live title preview built from the taps.
- **Same-spot hint:** when another injury matches, show "You've logged this
  before: …", most recent first.
  - If the latest match is closed, offer "Reopen that log instead?". That
    clears its `closed_on`, opens its page and throws away the form.
  - If the latest match is still open, offer "Check in on that one instead?".
- **What is it** (one line), **Symptoms** (textarea), **When did it start**
  (an optional date input with a **Roughly** toggle) and **How it happened**
  (textarea).
- Side and area are required, plus the finger or the "Where?" text when
  they apply. Everything else is optional.
- **Start log** creates the injury, then opens its page with the check-in
  sheet already open for today.
- **Edit** uses the same form with a Save button, and adds "Delete this
  injury" with a confirmation. Its check-ins are deleted with it by the
  cascade.

## Importing the Google Doc

- **Source:** the doc's text, saved at
  `.superpowers/tweaks/injury-log-source.txt`. Git ignores this file and it
  must never be committed, because the repo is public.
- **Output:** a one-off script at `.superpowers/tweaks/import.sql` (also
  ignored), which Rob pastes into the Supabase SQL editor. The editor runs as
  `postgres` and bypasses RLS. The script is never committed or shipped.
- It runs in one transaction and refuses to run if `injuries` already has
  rows, so running it twice doesn't duplicate anything.
- The row-by-row calls for this doc (typo'd dates, merged rows, start dates)
  are in `.superpowers/tweaks/import-notes.md`, kept local for privacy.

General mapping rules:

- The title line's date is the date the log started. The "Injury:" line
  becomes `what` and the symptoms text is copied as written.
- The "Injury started" text becomes `started_on`, `started_roughly` and
  `how_it_happened`:
  - An explicit date is used as is.
  - "Around X", "maybe X" or "noticed it at the weekend" becomes that date,
    marked as rough.
  - No date at all leaves `started_on` null. Don't invent precision.
- Pain:
  - "a" becomes low = high = a.
  - "a-b" becomes low a, high b.
  - "a-b / c" also sets the peak to c.
  - "5-6?" becomes 5–6, dropping the question mark.
- Odd rows:
  - A date whose year is clearly a typo (it sits out of sequence with its
    neighbours) is corrected to fit the sequence.
  - A row covering a span of days (e.g. "3-6/11") is stored on the first day,
    with the span at the start of its notes.
  - Two rows with the same date are imported as two check-ins, as written.
  - A paragraph that follows a row stays in that row's notes, separated by a
    blank line.
  - A closing remark after a log's last row ("Going to stop this log for
    now…") is added to the end of the last check-in's notes.
- Activities stay empty on imported check-ins rather than being guessed from
  the text *(my call)*.
- Every log is closed on its last check-in date, except the most recent one,
  which is still open.
- Notes keep their typos.

## Testing

- **Unit tests** (Vitest) for the pure helpers:
  - title building;
  - pain formatting;
  - chart scale and points;
  - same-spot matching;
  - "N days ago";
  - default values for a new check-in;
  - hub ordering.
- **Component tests:**
  - a long-press opens the sheet (with fake timers), and a short tap or a
    scroll doesn't;
  - picking a date that already has a check-in opens it for editing;
  - picking climber "Rob" no longer shows the setup buttons on the board
    list, but they appear in Tweaks;
  - a board with no photo still shows the upload prompt to everyone.
- **Supabase:** the builder never has the password and never writes test
  data to the live database *(my call)*. There's only one database, and a
  test send would show up for the crew straight away.
  - The builder runs the read-only anon probe above.
  - Automated tests mock both Supabase clients.
  - The signed-in checks are on Rob's phone checklist instead: Tweaks loads
    his imported logs, a check-in saves, and logging a real send while
    signed in still works.
- **Order:** Rob runs the table SQL and the import **before** testing, so he
  tests against his real history. Anything he makes while testing he can
  delete in the app.
- Rob tests on his phone with `npm run dev -- --host` before anything is
  merged. The local app uses the live Supabase data.

## Delivery

- Build on a `feat/tweaks` branch and open PRs to main after Rob has tested.
  It can be split into stacked PRs: (1) sign-in, the Tweaks shell and the
  board setup move; (2) the injury log. The builder decides.
- Rob's steps, given in the chat in this order:
  1. Create the user.
  2. Switch off sign-ups.
  3. Run the table SQL with his user id filled in.
  4. Run the import.
- No new environment variables, so Vercel needs no changes.

## Left to the builder

- The exact long-press timing, sheet animations and how the slider is built.
- How the code is split into files and components.
- Wording not given here, and date formatting details.

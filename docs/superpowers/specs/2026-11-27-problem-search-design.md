# Problem Search — Design

**Date:** 2026-11-27
**Status:** Agreed in brainstorming (Rob: "Yes, search first")
**Size:** a small change

## Why

The board has a lot of problems now, and finding one means scrolling the
whole list. Rob wants a simple text search that filters the list as you type.

## Goals

1. A search box on the board list that filters the problems as you type.
2. It matches a problem's name, its setter, or its grade.
3. It works together with the sort and **Unsent**: search narrows the list,
   sort orders what's left.

## Non-goals

- No searching notes, holds, climbers' ticks or votes.
- No fuzzy matching or typo tolerance.
- No saved or recent searches.

## Anti-goals

- It must not get in the way when you're not searching: one slim row, no
  extra taps to reach the list.
- Typing must never trigger a network request: it filters what's already
  loaded.

## Approaches

There's one sensible way: filter the problems already in memory, in the same
place `sortAndFilterProblems` already applies Unsent. A server-side search
would add a round trip per keystroke for a list of a few hundred rows at most,
and an icon that opens a search box would add a tap for no space saved (the
row under sort/Unsent has room).

## Design

**Where.** A full-width row directly under the sort / Unsent / climber row,
above Your projects. Only shown when the board has problems.

```
[Newest ▾] (Unsent)              📅 🏆 (Rob)
┌──────────────────────────────────────────┐
│ 🔍 Search problems                    ✕  │
└──────────────────────────────────────────┘
YOUR PROJECTS …
Gaston Traverse                       V5
```

- `type="search"`, `enterKeyHint="search"`; pressing Search/Enter closes the
  phone keyboard and keeps the filter.
- A ✕ appears once there's text, and clears it.
- 16px text, so iOS Safari doesn't zoom the page when the box is tapped
  (*my call* — the app's other inputs are 14.5px and do zoom).

**Matching** (a pure function in `lib/problemList.js`, unit tested):

- Case-insensitive. The query is split on spaces; **every** word must match
  the problem, so `crimp rob` finds Rob's problems with "crimp" in the name.
- A word matches if it's inside the name or the setter, or it equals the
  shown grade (`v5` matches V5 and V5?, but `v1` doesn't match V10).
  *My call*: exact grade so a grade search isn't flooded by V10–V17.
- An empty or all-space query matches everything.

**With the rest of the list.**

- Search filters first, then Unsent, then sort.
- Your projects is left alone, the same way sort and Unsent leave it alone
  (it's a shortcut, not part of the list).
- With a search and no matches: "No problems match ‘xyz’". The existing
  "Nothing unsent" message stays for when Unsent alone empties the list.
- The search stays while you open a problem and come back to the board, so
  you can check a few results in turn (*my call*). It clears on reload; it
  isn't saved anywhere.

## Left to the builder

- Exact styling, within the existing dark list style (`inputStyle` in
  `ui.js`, lucide `Search` / `X` icons).
- Tests: the matcher in `problemList.test.js`; one `App.test.jsx` test that
  typing filters the list and ✕ clears it.

## Shipping

Feature branch `feat/problem-search` → Rob tries it on his phone over LAN →
PR to main (main auto-deploys to Vercel).

# Todo App UI/UX Enhancement — Design Spec

**Date:** 2026-07-04
**Status:** Approved (design), pending spec review

## Objective

The existing frontend (`frontend/src/app/page.tsx`) is a single unstyled page using
inline styles — functional CRUD, no visual design. This spec covers a frontend-only
redesign: a polished, accessible, light/dark-mode UI plus a small set of client-side
UX features (filters, inline edit, progress, clear-completed). No backend, API, or
infrastructure changes are required — all new features are implemented against the
existing `GET/POST/PUT/DELETE /todos` endpoints.

This preserves every constraint in `CLAUDE.md`: static export only, same-origin
`/api/*` (no CORS), single Lambda function, `userId` derived only from the JWT.

## Decisions (locked)

| Area | Decision |
|------|----------|
| Styling | **Tailwind CSS** (build-time only — compatible with `next export`). `darkMode: 'class'`. |
| Aesthetic | Clean minimal: neutral gray scale + one indigo accent, rounded-lg cards, soft shadows, generous whitespace, `next/font` sans font. |
| Dark mode | Light + dark, user-toggleable, defaults to `prefers-color-scheme`, persisted to `localStorage`. |
| New UX features | Filter tabs (All/Active/Completed), inline editing, item count/progress bar, clear-completed button. |
| Interaction model | Optimistic local updates (add/toggle/edit/delete) with rollback + error banner on failure, replacing today's "mutate then refetch." |
| Auth screen | Amplify `Authenticator` restyled via `ThemeProvider` to match the app's palette/fonts/dark-mode, not left as Amplify defaults. |
| Scope boundary | Frontend-only. No new API routes, no backend/infra changes. |

## Component architecture

`frontend/src/app/page.tsx` keeps data-fetching and mutation logic (the existing
`listTodos`/`createTodo`/`updateTodo`/`deleteTodo` calls from `lib/api.ts`) and
composes new presentational components under `frontend/src/components/`:

- **`Header`** — app title, "X of Y done" summary + progress bar, theme toggle, sign-out.
- **`TodoForm`** — add-todo input, disabled/loading state while submitting.
- **`FilterTabs`** — All / Active / Completed, each showing a count, filtering the
  in-memory list client-side (no refetch).
- **`TodoList`** / **`TodoItem`** — checkbox, click-to-edit title, delete button;
  `TodoItem` owns its own inline-edit local state (editing text, save on Enter/blur,
  cancel on Escape).
- **`ClearCompletedButton`** — visible only when at least one todo is completed.
- **`EmptyState`** — shown when the (filtered) list is empty, with distinct copy for
  "no todos yet" vs. "no todos match this filter."
- **`ErrorBanner`** — dismissible banner replacing the current raw `<p>` error text.

`frontend/src/lib/theme.tsx` (new) holds a `ThemeContext` provider: tracks
`'light' | 'dark'`, initializes from `window.matchMedia('(prefers-color-scheme:
dark)')`, persists explicit user choice to `localStorage`, and toggles a class on
`<html>` for Tailwind. The same value is passed as `colorMode` to Amplify UI's
`<ThemeProvider>` (wrapping `<Authenticator>`), using `defaultDarkModeOverride`
merged with the app's accent-color tokens, so the sign-in card matches the app in
both themes.

## Feature behavior

- **Filters**: pure client-side derived state over the already-loaded `todos` array;
  counts (`active`, `completed`, `all`) computed from the same array — no extra fetch.
- **Inline editing**: clicking a todo's title turns it into a text input pre-filled
  with the current title. Enter or blur calls `updateTodo(id, { title })`; Escape
  discards the edit. Empty title on save is rejected (falls back to original text).
- **Item count / progress**: `"{completedCount} of {totalCount} done"` plus a slim
  progress bar (`completedCount / totalCount` width), hidden when there are zero todos.
- **Clear completed**: single button, shown only when `completedCount > 0`; guarded
  by `window.confirm` (irreversible bulk delete); deletes all completed todos in
  parallel (`Promise.all` over `deleteTodo`), then reconciles local state.

## Interaction model: optimistic updates

Today every mutation calls `refresh()` (a full `listTodos()` refetch) afterward,
which is correct but feels slow and causes visible list "flicker." The redesign
switches to optimistic local state updates:

- **Add**: append a locally-constructed todo immediately (using the server response
  once it resolves to reconcile IDs/timestamps); on failure, remove it and show
  `ErrorBanner`.
- **Toggle / inline edit**: flip the local field immediately; on failure, revert the
  field and show `ErrorBanner`.
- **Delete**: remove from local state immediately; on failure, re-insert and show
  `ErrorBanner`.

Initial page load keeps a full fetch, shown with a lightweight skeleton/spinner
state instead of a blank list while it resolves.

## Accessibility & responsiveness

- Semantic markup: real `<ul>/<li>`, `<button type="button">` for actions, `<label
  htmlFor>` pairing each checkbox with its todo text.
- `aria-label`s on icon-only controls (theme toggle, delete button).
- Visible focus rings (Tailwind `focus-visible:`) on all interactive elements;
  color choices verified for AA contrast in both light and dark themes.
- Mobile-first layout, usable down to ~360px width; centered `max-w-lg` container
  on wider viewports.

## Dependencies added

`frontend/package.json` devDependencies: `tailwindcss`, `postcss`, `autoprefixer`.
No new runtime dependencies — Amplify UI's existing `ThemeProvider`/dark-mode
support is already part of `@aws-amplify/ui-react`.

## Testing

- `next build` (static export) and `next lint` must continue to pass in CI —
  no change to the existing frontend CI gate described in the main design spec.
- No new backend tests needed (no backend changes).
- Manual verification: exercise add/toggle/edit/delete/filter/clear-completed and
  the light/dark toggle in a running `next dev` session before calling this done.

## Out of scope (YAGNI)

- New backend endpoints or DynamoDB schema changes.
- Due dates, tags/categories, search, drag-to-reorder, sharing.
- Multi-theme support beyond light/dark (no custom accent-color picker).
- SSR or any server compute for the frontend.

# Todo App UI/UX Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the todo app frontend with Tailwind CSS, light/dark mode, and four light UX features (filters, inline editing, progress, clear-completed), replacing the current unstyled single-file page.

**Architecture:** Frontend-only change. `frontend/src/app/page.tsx` keeps owning data-fetching/mutation state and is decomposed to compose new presentational components under `frontend/src/components/`. A new `ColorModeProvider` (`frontend/src/lib/theme.tsx`) drives both Tailwind's `dark:` classes and Amplify UI's `ThemeProvider colorMode`, keeping the Cognito Authenticator screen and the app visually in sync.

**Tech Stack:** Next.js 14 (static export), React 18, TypeScript, Tailwind CSS 3, `@aws-amplify/ui-react` (already a dependency), pnpm.

## Global Constraints

- Frontend must remain a pure static export (`output: 'export'` in `next.config.js`) — no server-only APIs, no SSR-only libraries.
- No backend, API Gateway, or DynamoDB changes — every feature uses the existing `GET/POST/PUT/DELETE /todos` endpoints in `frontend/src/lib/api.ts`.
- The SPA calls same-origin `/api/...` only — do not add CORS handling or point at a raw API Gateway URL.
- `userId` is never read/sent from the frontend — it is derived server-side from the JWT (no change needed here, just don't violate it).
- Single environment (prod) — no dev/staging branching logic in the app.
- Package manager is **pnpm** (`frontend/pnpm-lock.yaml`); all commands run from inside `frontend/`.
- No new frontend test framework is being introduced (none exists today). Verification per task is `pnpm lint` + `pnpm build`, with a full manual walkthrough in `pnpm dev` as the final task.

---

### Task 1: Tailwind CSS tooling setup

**Files:**
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/app/globals.css`
- Modify: `frontend/package.json`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: Tailwind utility classes (including `dark:` variants) usable in any `.tsx` file under `frontend/src/`; a `globals.css` imported once from `layout.tsx`.

- [ ] **Step 1: Add Tailwind dependencies to `frontend/package.json`**

Edit the `devDependencies` block to add:

```json
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.10",
```

(Keep existing entries; insert alphabetically among the existing devDependencies.)

- [ ] **Step 2: Install dependencies**

Run: `cd frontend && pnpm install`
Expected: lockfile updates, install succeeds with no errors.

- [ ] **Step 3: Create `frontend/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 4: Create `frontend/postcss.config.js`**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create `frontend/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html {
  color-scheme: light dark;
}
```

- [ ] **Step 6: Wire globals.css, Amplify styles, and a webfont into `frontend/src/app/layout.tsx`**

Replace the full file with:

```tsx
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import '@aws-amplify/ui-react/styles.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Todo',
  description: 'Serverless todo app',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-gray-50 dark:bg-gray-900">{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Verify lint and build**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: both succeed with no errors (the app still renders with its old inline styles — Tailwind is wired but not yet used in `page.tsx`).

- [ ] **Step 8: Commit**

```bash
git add frontend/tailwind.config.ts frontend/postcss.config.js frontend/src/app/globals.css frontend/src/app/layout.tsx frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(frontend): add Tailwind CSS tooling"
```

---

### Task 2: Color mode (light/dark) infrastructure + Amplify theme sync

**Files:**
- Create: `frontend/src/lib/theme.tsx`
- Create: `frontend/src/lib/amplifyTheme.ts`
- Create: `frontend/src/components/ThemeToggle.tsx`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: Tailwind `dark:` variant support from Task 1.
- Produces: `ColorModeProvider` / `useColorMode(): { colorMode: 'light' | 'dark'; toggleColorMode: () => void }` from `@/lib/theme`, re-used by every later task that needs the current color mode. `amplifyTheme: Theme` from `@/lib/amplifyTheme`. `<ThemeToggle />` component with no props.

- [ ] **Step 1: Create `frontend/src/lib/theme.tsx`**

```tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ColorMode = 'light' | 'dark';

interface ColorModeContextValue {
  colorMode: ColorMode;
  toggleColorMode: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue | undefined>(undefined);

const STORAGE_KEY = 'todo-app-color-mode';

function getInitialColorMode(): ColorMode {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorMode] = useState<ColorMode>('light');

  useEffect(() => {
    setColorMode(getInitialColorMode());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', colorMode === 'dark');
    window.localStorage.setItem(STORAGE_KEY, colorMode);
  }, [colorMode]);

  function toggleColorMode() {
    setColorMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  }

  return (
    <ColorModeContext.Provider value={{ colorMode, toggleColorMode }}>
      {children}
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode must be used within ColorModeProvider');
  return ctx;
}
```

- [ ] **Step 2: Create `frontend/src/lib/amplifyTheme.ts`**

```typescript
import { defaultDarkModeOverride, type Theme } from '@aws-amplify/ui-react';

export const amplifyTheme: Theme = {
  name: 'todo-app-theme',
  tokens: {
    colors: {
      brand: {
        primary: {
          10: { value: '#eef2ff' },
          20: { value: '#e0e7ff' },
          40: { value: '#a5b4fc' },
          80: { value: '#4f46e5' },
          90: { value: '#4338ca' },
          100: { value: '#3730a3' },
        },
      },
    },
  },
  overrides: [defaultDarkModeOverride],
};
```

- [ ] **Step 3: Create `frontend/src/components/ThemeToggle.tsx`**

```tsx
'use client';

import { useColorMode } from '@/lib/theme';

export function ThemeToggle() {
  const { colorMode, toggleColorMode } = useColorMode();
  const isDark = colorMode === 'dark';

  return (
    <button
      type="button"
      onClick={toggleColorMode}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-full p-2 text-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
    >
      {isDark ? '🌙' : '☀️'}
    </button>
  );
}
```

- [ ] **Step 4: Wrap the app in `ColorModeProvider` and the Amplify `ThemeProvider`, add the toggle, and Tailwind-ify the existing markup**

Replace the full contents of `frontend/src/app/page.tsx` with:

```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Authenticator,
  useAuthenticator,
  ThemeProvider as AmplifyThemeProvider,
} from '@aws-amplify/ui-react';
import { configureAmplify } from '@/lib/amplify';
import { amplifyTheme } from '@/lib/amplifyTheme';
import { ColorModeProvider, useColorMode } from '@/lib/theme';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  type Todo,
} from '@/lib/api';

configureAmplify();

function AmplifyThemed({ children }: { children: ReactNode }) {
  const { colorMode } = useColorMode();
  return (
    <AmplifyThemeProvider theme={amplifyTheme} colorMode={colorMode}>
      {children}
    </AmplifyThemeProvider>
  );
}

function TodoApp() {
  const { signOut, user } = useAuthenticator((c) => [c.user]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setTodos(await listTodos());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await createTodo(title.trim());
    setTitle('');
    await refresh();
  }

  async function onToggle(t: Todo) {
    await updateTodo(t.todoId, { completed: !t.completed });
    await refresh();
  }

  async function onDelete(t: Todo) {
    await deleteTodo(t.todoId);
    await refresh();
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Todos</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={signOut}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Sign out ({user?.signInDetails?.loginId})
          </button>
        </div>
      </header>

      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}

      <form onSubmit={onAdd} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Add
        </button>
      </form>

      <ul className="mt-4">
        {todos.map((t) => (
          <li
            key={t.todoId}
            className="flex items-center gap-3 border-b border-gray-100 py-3 dark:border-gray-800"
          >
            <input type="checkbox" checked={t.completed} onChange={() => onToggle(t)} />
            <span
              className={`flex-1 text-gray-900 dark:text-gray-100 ${
                t.completed ? 'text-gray-400 line-through dark:text-gray-500' : ''
              }`}
            >
              {t.title}
            </span>
            <button onClick={() => onDelete(t)} className="text-gray-400 hover:text-red-600">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function Page() {
  return (
    <ColorModeProvider>
      <AmplifyThemed>
        <Authenticator>
          <TodoApp />
        </Authenticator>
      </AmplifyThemed>
    </ColorModeProvider>
  );
}
```

- [ ] **Step 5: Verify lint and build**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: both succeed.

- [ ] **Step 6: Manual check**

Run: `cd frontend && pnpm dev`, open the app, sign in.
- Click the sun/moon button: page background, text, sign-in card, and buttons should all switch between light and dark styling together.
- Reload the page: the previously chosen mode should persist (read from `localStorage`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/theme.tsx frontend/src/lib/amplifyTheme.ts frontend/src/components/ThemeToggle.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): add light/dark mode toggle synced with Amplify Authenticator"
```

---

### Task 3: Header, TodoForm, EmptyState, ErrorBanner components

**Files:**
- Create: `frontend/src/components/Header.tsx`
- Create: `frontend/src/components/TodoForm.tsx`
- Create: `frontend/src/components/EmptyState.tsx`
- Create: `frontend/src/components/ErrorBanner.tsx`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` from Task 2 (used inside `Header`).
- Produces: `Header({ signOutLabel?: string; onSignOut: () => void; completedCount: number; totalCount: number })`; `TodoForm({ onAdd: (title: string) => void | Promise<void> })`; `EmptyState({ hasAnyTodos: boolean })`; `ErrorBanner({ message: string; onDismiss: () => void })` — all consumed by later tasks' versions of `page.tsx`.

- [ ] **Step 1: Create `frontend/src/components/Header.tsx`**

```tsx
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  signOutLabel?: string;
  onSignOut: () => void;
  completedCount: number;
  totalCount: number;
}

export function Header({ signOutLabel, onSignOut, completedCount, totalCount }: HeaderProps) {
  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <header className="mb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Todos</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Sign out{signOutLabel ? ` (${signOutLabel})` : ''}
          </button>
        </div>
      </div>

      {totalCount > 0 && (
        <div className="mt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {completedCount} of {totalCount} done
          </p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/TodoForm.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';

interface TodoFormProps {
  onAdd: (title: string) => void | Promise<void>;
}

export function TodoForm({ onAdd }: TodoFormProps) {
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onAdd(trimmed);
      setTitle('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing?"
        disabled={submitting}
        className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
      <button
        type="submit"
        disabled={submitting || !title.trim()}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create `frontend/src/components/EmptyState.tsx`**

```tsx
interface EmptyStateProps {
  hasAnyTodos: boolean;
}

export function EmptyState({ hasAnyTodos }: EmptyStateProps) {
  return (
    <p className="mt-8 text-center text-gray-400 dark:text-gray-500">
      {hasAnyTodos ? 'No todos match this filter.' : 'No todos yet — add your first one above.'}
    </p>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/ErrorBanner.tsx`**

```tsx
interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="mt-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Wire the new components into `page.tsx` and add a loading state**

Replace the full contents of `frontend/src/app/page.tsx` with:

```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Authenticator,
  useAuthenticator,
  ThemeProvider as AmplifyThemeProvider,
} from '@aws-amplify/ui-react';
import { configureAmplify } from '@/lib/amplify';
import { amplifyTheme } from '@/lib/amplifyTheme';
import { ColorModeProvider, useColorMode } from '@/lib/theme';
import { Header } from '@/components/Header';
import { TodoForm } from '@/components/TodoForm';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  type Todo,
} from '@/lib/api';

configureAmplify();

function AmplifyThemed({ children }: { children: ReactNode }) {
  const { colorMode } = useColorMode();
  return (
    <AmplifyThemeProvider theme={amplifyTheme} colorMode={colorMode}>
      {children}
    </AmplifyThemeProvider>
  );
}

function TodoApp() {
  const { signOut, user } = useAuthenticator((c) => [c.user]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setTodos(await listTodos());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  async function onAdd(title: string) {
    await createTodo(title);
    await refresh();
  }

  async function onToggle(t: Todo) {
    await updateTodo(t.todoId, { completed: !t.completed });
    await refresh();
  }

  async function onDelete(t: Todo) {
    await deleteTodo(t.todoId);
    await refresh();
  }

  const completedCount = todos.filter((t) => t.completed).length;

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-8">
      <Header
        signOutLabel={user?.signInDetails?.loginId}
        onSignOut={signOut}
        completedCount={completedCount}
        totalCount={todos.length}
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <TodoForm onAdd={onAdd} />

      {loading ? (
        <p className="mt-8 text-center text-gray-400 dark:text-gray-500">Loading…</p>
      ) : todos.length === 0 ? (
        <EmptyState hasAnyTodos={false} />
      ) : (
        <ul className="mt-4">
          {todos.map((t) => (
            <li
              key={t.todoId}
              className="flex items-center gap-3 border-b border-gray-100 py-3 dark:border-gray-800"
            >
              <input type="checkbox" checked={t.completed} onChange={() => onToggle(t)} />
              <span
                className={`flex-1 text-gray-900 dark:text-gray-100 ${
                  t.completed ? 'text-gray-400 line-through dark:text-gray-500' : ''
                }`}
              >
                {t.title}
              </span>
              <button onClick={() => onDelete(t)} className="text-gray-400 hover:text-red-600">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <ColorModeProvider>
      <AmplifyThemed>
        <Authenticator>
          <TodoApp />
        </Authenticator>
      </AmplifyThemed>
    </ColorModeProvider>
  );
}
```

- [ ] **Step 6: Verify lint and build**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: both succeed.

- [ ] **Step 7: Manual check**

Run: `cd frontend && pnpm dev`. Confirm the header shows the progress bar/count once todos exist, the error banner is dismissible (temporarily break the API URL to trigger it, then revert), and the empty state message shows when the list is empty.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/Header.tsx frontend/src/components/TodoForm.tsx frontend/src/components/EmptyState.tsx frontend/src/components/ErrorBanner.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): extract Header/TodoForm/EmptyState/ErrorBanner components"
```

---

### Task 4: TodoItem + TodoList with inline editing

**Files:**
- Create: `frontend/src/components/TodoItem.tsx`
- Create: `frontend/src/components/TodoList.tsx`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `Todo` type from `@/lib/api` (Task 0, pre-existing).
- Produces: `TodoList({ todos: Todo[]; onToggle: (todo: Todo) => void; onEdit: (todo: Todo, title: string) => void; onDelete: (todo: Todo) => void })`, consumed by `page.tsx` in this task and unchanged after.

- [ ] **Step 1: Create `frontend/src/components/TodoItem.tsx`**

```tsx
'use client';

import { useState, type KeyboardEvent } from 'react';
import type { Todo } from '@/lib/api';

interface TodoItemProps {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo, title: string) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoItem({ todo, onToggle, onEdit, onDelete }: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);

  function startEditing() {
    setDraft(todo.title);
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== todo.title) {
      onEdit(todo, trimmed);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') {
      setDraft(todo.title);
      setEditing(false);
    }
  }

  return (
    <li className="flex items-center gap-3 border-b border-gray-100 py-3 last:border-0 dark:border-gray-800">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo)}
        aria-label={
          todo.completed ? `Mark "${todo.title}" as not completed` : `Mark "${todo.title}" as completed`
        }
        className="h-5 w-5 shrink-0 rounded border-gray-300 text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-gray-600"
      />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="flex-1 rounded border border-indigo-300 bg-white px-2 py-1 text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-indigo-600 dark:bg-gray-800 dark:text-gray-100"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className={`flex-1 truncate text-left text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-gray-100 ${
            todo.completed ? 'text-gray-400 line-through dark:text-gray-500' : ''
          }`}
        >
          {todo.title}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDelete(todo)}
        aria-label={`Delete "${todo.title}"`}
        className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-red-950"
      >
        ✕
      </button>
    </li>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/TodoList.tsx`**

```tsx
import type { Todo } from '@/lib/api';
import { TodoItem } from './TodoItem';

interface TodoListProps {
  todos: Todo[];
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo, title: string) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoList({ todos, onToggle, onEdit, onDelete }: TodoListProps) {
  return (
    <ul className="mt-4">
      {todos.map((todo) => (
        <TodoItem
          key={todo.todoId}
          todo={todo}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Replace the inline `<ul>` in `page.tsx` with `TodoList`, and add an `onEdit` handler**

In `frontend/src/app/page.tsx`:

1. Add the import:

```tsx
import { TodoList } from '@/components/TodoList';
```

2. Add a new handler next to `onToggle`:

```tsx
  async function onEdit(t: Todo, title: string) {
    await updateTodo(t.todoId, { title });
    await refresh();
  }
```

3. Replace the `loading ? ... : todos.length === 0 ? ... : (<ul>...</ul>)` block with:

```tsx
      {loading ? (
        <p className="mt-8 text-center text-gray-400 dark:text-gray-500">Loading…</p>
      ) : todos.length === 0 ? (
        <EmptyState hasAnyTodos={false} />
      ) : (
        <TodoList todos={todos} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
      )}
```

- [ ] **Step 4: Verify lint and build**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: both succeed.

- [ ] **Step 5: Manual check**

Run: `cd frontend && pnpm dev`. Click a todo's text — it becomes an editable input. Press Enter to save a change, Escape to cancel, and confirm the checkbox and delete button still work independently of the text click.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TodoItem.tsx frontend/src/components/TodoList.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): add TodoItem/TodoList with inline editing"
```

---

### Task 5: Filter tabs + clear-completed

**Files:**
- Create: `frontend/src/components/FilterTabs.tsx`
- Create: `frontend/src/components/ClearCompletedButton.tsx`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `TodoList` from Task 4.
- Produces: `Filter = 'all' | 'active' | 'completed'` type and `FilterTabs({ filter: Filter; onChange: (f: Filter) => void; allCount: number; activeCount: number; completedCount: number })` exported from `@/components/FilterTabs`; `ClearCompletedButton({ count: number; onClear: () => void })`.

- [ ] **Step 1: Create `frontend/src/components/FilterTabs.tsx`**

```tsx
export type Filter = 'all' | 'active' | 'completed';

interface FilterTabsProps {
  filter: Filter;
  onChange: (filter: Filter) => void;
  allCount: number;
  activeCount: number;
  completedCount: number;
}

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

export function FilterTabs({
  filter,
  onChange,
  allCount,
  activeCount,
  completedCount,
}: FilterTabsProps) {
  const counts: Record<Filter, number> = {
    all: allCount,
    active: activeCount,
    completed: completedCount,
  };

  return (
    <div className="mt-4 flex gap-1 rounded-md bg-gray-100 p-1 dark:bg-gray-800" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={filter === tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
            filter === tab.key
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-50'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          {tab.label} ({counts[tab.key]})
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/ClearCompletedButton.tsx`**

```tsx
interface ClearCompletedButtonProps {
  count: number;
  onClear: () => void;
}

export function ClearCompletedButton({ count, onClear }: ClearCompletedButtonProps) {
  return (
    <div className="mt-4 text-right">
      <button
        type="button"
        onClick={onClear}
        className="text-sm text-gray-500 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-gray-400 dark:hover:text-red-400"
      >
        Clear completed ({count})
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Wire filter state and clear-completed into `page.tsx`**

Replace the full contents of `frontend/src/app/page.tsx` with:

```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Authenticator,
  useAuthenticator,
  ThemeProvider as AmplifyThemeProvider,
} from '@aws-amplify/ui-react';
import { configureAmplify } from '@/lib/amplify';
import { amplifyTheme } from '@/lib/amplifyTheme';
import { ColorModeProvider, useColorMode } from '@/lib/theme';
import { Header } from '@/components/Header';
import { TodoForm } from '@/components/TodoForm';
import { FilterTabs, type Filter } from '@/components/FilterTabs';
import { TodoList } from '@/components/TodoList';
import { ClearCompletedButton } from '@/components/ClearCompletedButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  type Todo,
} from '@/lib/api';

configureAmplify();

function AmplifyThemed({ children }: { children: ReactNode }) {
  const { colorMode } = useColorMode();
  return (
    <AmplifyThemeProvider theme={amplifyTheme} colorMode={colorMode}>
      {children}
    </AmplifyThemeProvider>
  );
}

function TodoApp() {
  const { signOut, user } = useAuthenticator((c) => [c.user]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  async function refresh() {
    try {
      setTodos(await listTodos());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  async function onAdd(title: string) {
    await createTodo(title);
    await refresh();
  }

  async function onToggle(t: Todo) {
    await updateTodo(t.todoId, { completed: !t.completed });
    await refresh();
  }

  async function onEdit(t: Todo, title: string) {
    await updateTodo(t.todoId, { title });
    await refresh();
  }

  async function onDelete(t: Todo) {
    await deleteTodo(t.todoId);
    await refresh();
  }

  async function onClearCompleted() {
    const completed = todos.filter((t) => t.completed);
    if (completed.length === 0) return;
    if (!window.confirm(`Delete ${completed.length} completed todo(s)?`)) return;
    await Promise.all(completed.map((t) => deleteTodo(t.todoId)));
    await refresh();
  }

  const activeCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.length - activeCount;
  const visibleTodos = todos.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-8">
      <Header
        signOutLabel={user?.signInDetails?.loginId}
        onSignOut={signOut}
        completedCount={completedCount}
        totalCount={todos.length}
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <TodoForm onAdd={onAdd} />

      {todos.length > 0 && (
        <FilterTabs
          filter={filter}
          onChange={setFilter}
          allCount={todos.length}
          activeCount={activeCount}
          completedCount={completedCount}
        />
      )}

      {loading ? (
        <p className="mt-8 text-center text-gray-400 dark:text-gray-500">Loading…</p>
      ) : visibleTodos.length === 0 ? (
        <EmptyState hasAnyTodos={todos.length > 0} />
      ) : (
        <TodoList todos={visibleTodos} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
      )}

      {completedCount > 0 && (
        <ClearCompletedButton count={completedCount} onClear={onClearCompleted} />
      )}
    </main>
  );
}

export default function Page() {
  return (
    <ColorModeProvider>
      <AmplifyThemed>
        <Authenticator>
          <TodoApp />
        </Authenticator>
      </AmplifyThemed>
    </ColorModeProvider>
  );
}
```

- [ ] **Step 4: Verify lint and build**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: both succeed.

- [ ] **Step 5: Manual check**

Run: `cd frontend && pnpm dev`. Add a few todos, complete some, switch between All/Active/Completed tabs and confirm counts and the visible list match, then use "Clear completed" and confirm the confirm-dialog + bulk delete works.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/FilterTabs.tsx frontend/src/components/ClearCompletedButton.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): add filter tabs and clear-completed action"
```

---

### Task 6: Optimistic updates

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: all components from Tasks 2-5 (no prop changes to any of them).
- Produces: same `TodoApp` behavior as before from the outside, but mutations apply to local state immediately instead of waiting on a full `refresh()`.

- [ ] **Step 1: Replace the mutation handlers in `frontend/src/app/page.tsx` with optimistic versions**

Replace the full contents of `frontend/src/app/page.tsx` with:

```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Authenticator,
  useAuthenticator,
  ThemeProvider as AmplifyThemeProvider,
} from '@aws-amplify/ui-react';
import { configureAmplify } from '@/lib/amplify';
import { amplifyTheme } from '@/lib/amplifyTheme';
import { ColorModeProvider, useColorMode } from '@/lib/theme';
import { Header } from '@/components/Header';
import { TodoForm } from '@/components/TodoForm';
import { FilterTabs, type Filter } from '@/components/FilterTabs';
import { TodoList } from '@/components/TodoList';
import { ClearCompletedButton } from '@/components/ClearCompletedButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  type Todo,
} from '@/lib/api';

configureAmplify();

function AmplifyThemed({ children }: { children: ReactNode }) {
  const { colorMode } = useColorMode();
  return (
    <AmplifyThemeProvider theme={amplifyTheme} colorMode={colorMode}>
      {children}
    </AmplifyThemeProvider>
  );
}

function TodoApp() {
  const { signOut, user } = useAuthenticator((c) => [c.user]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    void (async () => {
      try {
        setTodos(await listTodos());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onAdd(title: string) {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();
    const optimistic: Todo = {
      userId: user?.userId ?? '',
      todoId: tempId,
      title,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    setTodos((prev) => [...prev, optimistic]);
    try {
      const created = await createTodo(title);
      setTodos((prev) => prev.map((t) => (t.todoId === tempId ? created : t)));
    } catch (e) {
      setTodos((prev) => prev.filter((t) => t.todoId !== tempId));
      setError((e as Error).message);
    }
  }

  async function onToggle(t: Todo) {
    const next = !t.completed;
    setTodos((prev) => prev.map((x) => (x.todoId === t.todoId ? { ...x, completed: next } : x)));
    try {
      await updateTodo(t.todoId, { completed: next });
    } catch (e) {
      setTodos((prev) =>
        prev.map((x) => (x.todoId === t.todoId ? { ...x, completed: !next } : x)),
      );
      setError((e as Error).message);
    }
  }

  async function onEdit(t: Todo, title: string) {
    const previousTitle = t.title;
    setTodos((prev) => prev.map((x) => (x.todoId === t.todoId ? { ...x, title } : x)));
    try {
      await updateTodo(t.todoId, { title });
    } catch (e) {
      setTodos((prev) =>
        prev.map((x) => (x.todoId === t.todoId ? { ...x, title: previousTitle } : x)),
      );
      setError((e as Error).message);
    }
  }

  async function onDelete(t: Todo) {
    setTodos((prev) => prev.filter((x) => x.todoId !== t.todoId));
    try {
      await deleteTodo(t.todoId);
    } catch (e) {
      setTodos((prev) => [...prev, t]);
      setError((e as Error).message);
    }
  }

  async function onClearCompleted() {
    const completed = todos.filter((t) => t.completed);
    if (completed.length === 0) return;
    if (!window.confirm(`Delete ${completed.length} completed todo(s)?`)) return;
    setTodos((prev) => prev.filter((t) => !t.completed));
    try {
      await Promise.all(completed.map((t) => deleteTodo(t.todoId)));
    } catch (e) {
      setTodos((prev) => [...prev, ...completed]);
      setError((e as Error).message);
    }
  }

  const activeCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.length - activeCount;
  const visibleTodos = todos.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-8">
      <Header
        signOutLabel={user?.signInDetails?.loginId}
        onSignOut={signOut}
        completedCount={completedCount}
        totalCount={todos.length}
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <TodoForm onAdd={onAdd} />

      {todos.length > 0 && (
        <FilterTabs
          filter={filter}
          onChange={setFilter}
          allCount={todos.length}
          activeCount={activeCount}
          completedCount={completedCount}
        />
      )}

      {loading ? (
        <p className="mt-8 text-center text-gray-400 dark:text-gray-500">Loading…</p>
      ) : visibleTodos.length === 0 ? (
        <EmptyState hasAnyTodos={todos.length > 0} />
      ) : (
        <TodoList todos={visibleTodos} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
      )}

      {completedCount > 0 && (
        <ClearCompletedButton count={completedCount} onClear={onClearCompleted} />
      )}
    </main>
  );
}

export default function Page() {
  return (
    <ColorModeProvider>
      <AmplifyThemed>
        <Authenticator>
          <TodoApp />
        </Authenticator>
      </AmplifyThemed>
    </ColorModeProvider>
  );
}
```

- [ ] **Step 2: Verify lint and build**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: both succeed.

- [ ] **Step 3: Manual check, including a failure path**

Run: `cd frontend && pnpm dev`.
- Add/toggle/edit/delete a todo and confirm the UI updates immediately (no visible "flash" from a refetch).
- Open browser devtools → Network tab → set throttling to "Offline", then toggle a todo. Confirm the checkbox flips back and an error banner appears. Restore the network afterward.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(frontend): switch todo mutations to optimistic local updates"
```

---

### Task 7: Accessibility/responsive polish + full manual verification

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/components/Header.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: no new interfaces — this task is a final hardening + verification pass, matching the "Testing" section of `docs/superpowers/specs/2026-07-04-todo-app-ui-ux-design.md`.

- [ ] **Step 1: Add a light-mode `color-scheme` fallback and a document-level focus style**

Modify `frontend/src/app/layout.tsx`'s `<body>` line to also set a base text color so text is never unstyled if a component forgets one:

```tsx
      <body className="bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">{children}</body>
```

- [ ] **Step 2: Give the header's sign-out/theme controls a visible grouping on narrow screens**

In `frontend/src/components/Header.tsx`, change the outer `<div className="flex items-center justify-between">` to wrap on very narrow widths instead of overflowing:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-2">
```

- [ ] **Step 3: Verify lint and build**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: both succeed.

- [ ] **Step 4: Full manual verification pass**

Run: `cd frontend && pnpm dev` and, in a real browser:

1. Sign in via the (now themed) Authenticator; confirm it matches the app's palette in both light and dark mode.
2. Add several todos; confirm the progress bar/count updates.
3. Toggle completion, edit a title inline (Enter to save, Escape to cancel), delete a todo.
4. Switch filter tabs (All/Active/Completed) and confirm counts and visible items match.
5. Use "Clear completed" and confirm the confirm-dialog and bulk removal work.
6. Toggle light/dark mode; reload the page and confirm the choice persisted.
7. Resize the browser down to ~360px width (or use devtools device toolbar) and confirm no horizontal overflow or clipped controls.
8. Tab through the page with the keyboard only; confirm every interactive element (theme toggle, sign out, add input/button, filter tabs, todo checkbox/title/delete, clear-completed) is reachable and shows a visible focus ring.
9. Using browser devtools' contrast checker (e.g. Chrome DevTools' color picker on a text element), spot-check body text vs. its background and the indigo button text vs. its background in both light and dark mode; confirm each is at least AA (4.5:1 for normal text).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/layout.tsx frontend/src/components/Header.tsx
git commit -m "feat(frontend): responsive/accessibility polish pass"
```

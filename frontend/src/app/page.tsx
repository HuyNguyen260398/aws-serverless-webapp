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

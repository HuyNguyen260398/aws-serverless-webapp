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
import { TodoList } from '@/components/TodoList';
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

  async function onEdit(t: Todo, title: string) {
    await updateTodo(t.todoId, { title });
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
        <TodoList todos={todos} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
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

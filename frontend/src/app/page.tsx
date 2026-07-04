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

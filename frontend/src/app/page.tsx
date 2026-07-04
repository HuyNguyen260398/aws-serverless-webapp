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

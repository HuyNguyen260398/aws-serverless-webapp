'use client';

import { useEffect, useState } from 'react';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { configureAmplify } from '@/lib/amplify';
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  type Todo,
} from '@/lib/api';

configureAmplify();

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
    <main style={{ maxWidth: 560, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>Todos</h1>
        <button onClick={signOut}>Sign out ({user?.signInDetails?.loginId})</button>
      </header>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={onAdd} style={{ display: 'flex', gap: 8 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          style={{ flex: 1 }}
        />
        <button type="submit">Add</button>
      </form>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {todos.map((t) => (
          <li key={t.todoId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={t.completed} onChange={() => onToggle(t)} />
            <span style={{ flex: 1, textDecoration: t.completed ? 'line-through' : 'none' }}>
              {t.title}
            </span>
            <button onClick={() => onDelete(t)}>Delete</button>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function Page() {
  return (
    <Authenticator>
      <TodoApp />
    </Authenticator>
  );
}

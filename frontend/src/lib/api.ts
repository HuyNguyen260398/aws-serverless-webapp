import { fetchAuthSession } from 'aws-amplify/auth';

export interface Todo {
  userId: string;
  todoId: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

const BASE = '/api/todos';

async function authHeaders(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('not authenticated');
  return { Authorization: token, 'Content-Type': 'application/json' };
}

async function handle(res: Response): Promise<unknown> {
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`request failed (${res.status}): ${detail}`);
  }
  return res.status === 204 ? undefined : res.json();
}

export async function listTodos(): Promise<Todo[]> {
  const res = await fetch(BASE, { headers: await authHeaders() });
  return (await handle(res)) as Todo[];
}

export async function createTodo(title: string): Promise<Todo> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ title }),
  });
  return (await handle(res)) as Todo;
}

export async function updateTodo(
  id: string,
  patch: { title?: string; completed?: boolean },
): Promise<Todo> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(patch),
  });
  return (await handle(res)) as Todo;
}

export async function deleteTodo(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  await handle(res);
}

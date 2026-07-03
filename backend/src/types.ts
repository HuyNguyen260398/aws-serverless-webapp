export interface Todo {
  userId: string;
  todoId: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoInput {
  title: string;
}

export interface UpdateTodoInput {
  title?: string;
  completed?: boolean;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const MAX_TITLE = 500;

function asObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

function normalizeTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError('title is required and must be a non-empty string');
  }
  if (value.length > MAX_TITLE) {
    throw new ValidationError(`title must be ${MAX_TITLE} characters or fewer`);
  }
  return value.trim();
}

export function parseCreateInput(body: unknown): CreateTodoInput {
  const obj = asObject(body);
  return { title: normalizeTitle(obj.title) };
}

export function parseUpdateInput(body: unknown): UpdateTodoInput {
  const obj = asObject(body);
  const out: UpdateTodoInput = {};
  if (obj.title !== undefined) {
    out.title = normalizeTitle(obj.title);
  }
  if (obj.completed !== undefined) {
    if (typeof obj.completed !== 'boolean') {
      throw new ValidationError('completed must be a boolean');
    }
    out.completed = obj.completed;
  }
  if (out.title === undefined && out.completed === undefined) {
    throw new ValidationError('at least one of title or completed must be provided');
  }
  return out;
}

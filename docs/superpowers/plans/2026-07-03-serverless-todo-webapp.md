# Serverless Todo Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a per-user todo web app on the AWS serverless "Web application" reference architecture (Cognito → CloudFront → S3 → API Gateway → Lambda → DynamoDB), provisioned with Terraform and deployed via GitHub Actions.

**Architecture:** A Next.js static-export SPA is hosted on a private S3 bucket and served through CloudFront. CloudFront also fronts the REST API via an `/api/*` behavior, so the SPA is same-origin with the API and needs no CORS. A single Lambda function behind API Gateway (guarded by a Cognito authorizer) performs CRUD on a single DynamoDB table, deriving the owning `userId` from the validated JWT.

**Tech Stack:** TypeScript (Node.js 20) for the Lambda and the Next.js frontend; **pnpm** for Node package management; AWS SDK v3; Jest + `aws-sdk-client-mock` for backend tests; AWS Amplify (`@aws-amplify/ui-react`) for auth; Terraform (AWS provider) for IaC; GitHub Actions with OIDC for CI/CD.

**Source of truth:** `docs/superpowers/specs/2026-07-03-serverless-todo-webapp-design.md`.

## Global Constraints

- **Follow the AWS reference architecture exactly** — the six components in their documented roles; no substitutions.
- **Frontend is static export only** — `next.config.js` sets `output: 'export'`. No SSR / server components requiring a runtime.
- **CloudFront fronts both origins** — default → S3; `/api/*` → API Gateway. Frontend calls **same-origin `/api/...`**. **No CORS** anywhere.
- **API Gateway stage name is `api`** — so a request to CloudFront `/api/todos` maps to API Gateway stage `api`, resource `/todos`, with no path rewriting.
- **`userId` is always `event.requestContext.authorizer.claims.sub`** — never from body/query. This is the ownership invariant.
- **Single Lambda** (`nodejs20.x`, handler `index.handler`) with internal routing; **single DynamoDB table** keyed `userId` (PK, HASH) + `todoId` (SK, RANGE).
- **Single environment (prod).** GitHub Actions authenticates to AWS via **OIDC** — no static AWS keys.
- **Node 20** everywhere; `.nvmrc` pins it. **pnpm** is the package manager (lockfile `pnpm-lock.yaml`; CI installs with `pnpm install --frozen-lockfile`). Terraform `>= 1.6`, AWS provider `~> 5.0`.

## File Structure

```
backend/
  package.json          # deps, scripts (build via esbuild, test via jest)
  tsconfig.json
  jest.config.js
  src/types.ts          # Todo, input types, validation (parseCreateInput/parseUpdateInput)
  src/repository.ts     # TodoRepository: list/get/create/update/delete over DynamoDB
  src/handler.ts        # Lambda entry + route() dispatcher
  test/types.test.ts
  test/repository.test.ts
  test/router.test.ts

infra/
  bootstrap/            # one-time: state bucket + lock table (local state)
    main.tf
  modules/
    data/               # DynamoDB table
    compute/            # Lambda + IAM role/policy
    auth/               # Cognito user pool + app client
    api/                # API Gateway REST + Cognito authorizer + routes + deployment
    frontend/           # S3 + CloudFront + OAC + /api behavior
  envs/prod/            # root: wires modules, remote backend, outputs

frontend/
  package.json
  next.config.js        # output: 'export'
  tsconfig.json
  .env.example
  src/lib/amplify.ts    # Amplify.configure from NEXT_PUBLIC_* env
  src/lib/api.ts        # typed fetch client hitting /api/todos with JWT
  src/app/layout.tsx
  src/app/page.tsx      # Authenticator-gated todo UI

.github/workflows/
  ci.yml                # PR: backend test, frontend build, terraform validate/plan
  deploy.yml            # main: terraform apply, package lambda, deploy frontend, invalidate

.nvmrc
.gitignore
README.md               # bootstrap + OIDC setup instructions
```

---

## Phase 1 — Backend (TDD)

### Task 1: Backend project scaffolding

**Files:**
- Create: `.nvmrc`, `.gitignore`, `backend/package.json`, `backend/tsconfig.json`, `backend/jest.config.js`

**Interfaces:**
- Produces: an installable backend package with `pnpm test`, `pnpm run build`, `pnpm run lint` scripts. Build emits `backend/dist/index.js` (CJS) exporting `handler`.

- [x] **Step 1: Create `.nvmrc`**

```
20
```

- [x] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
dist/
.next/
out/
*.zip
.terraform/
*.tfstate
*.tfstate.*
.terraform.lock.hcl
crash.log
.env
.env.local
coverage/
```

- [x] **Step 3: Create `backend/package.json`**

```json
{
  "name": "todo-backend",
  "version": "1.0.0",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "esbuild src/handler.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/index.js",
    "test": "jest",
    "lint": "eslint 'src/**/*.ts' 'test/**/*.ts'"
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.600.0",
    "@aws-sdk/lib-dynamodb": "^3.600.0",
    "ulid": "^2.3.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.140",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^7.13.0",
    "@typescript-eslint/parser": "^7.13.0",
    "aws-sdk-client-mock": "^4.0.1",
    "esbuild": "^0.21.5",
    "eslint": "^8.57.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.5",
    "typescript": "^5.4.5"
  }
}
```

- [x] **Step 4: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [x] **Step 5: Create `backend/jest.config.js`**

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
};
```

- [x] **Step 6: Install and verify tooling**

Run: `cd backend && pnpm install`
Expected: installs without error; `node_modules` present.

- [x] **Step 7: Commit**

```bash
git add .nvmrc .gitignore backend/package.json backend/tsconfig.json backend/jest.config.js backend/pnpm-lock.yaml
git commit -m "chore: scaffold backend package"
```

---

### Task 2: Todo types and input validation

**Files:**
- Create: `backend/src/types.ts`
- Test: `backend/test/types.test.ts`

**Interfaces:**
- Produces:
  - `interface Todo { userId: string; todoId: string; title: string; completed: boolean; createdAt: string; updatedAt: string }`
  - `interface CreateTodoInput { title: string }`
  - `interface UpdateTodoInput { title?: string; completed?: boolean }`
  - `class ValidationError extends Error`
  - `function parseCreateInput(body: unknown): CreateTodoInput` — throws `ValidationError`
  - `function parseUpdateInput(body: unknown): UpdateTodoInput` — throws `ValidationError`

- [x] **Step 1: Write the failing test**

`backend/test/types.test.ts`:
```ts
import {
  parseCreateInput,
  parseUpdateInput,
  ValidationError,
} from '../src/types';

describe('parseCreateInput', () => {
  it('accepts a valid title and trims it', () => {
    expect(parseCreateInput({ title: '  buy milk ' })).toEqual({ title: 'buy milk' });
  });

  it('rejects missing title', () => {
    expect(() => parseCreateInput({})).toThrow(ValidationError);
  });

  it('rejects empty/whitespace title', () => {
    expect(() => parseCreateInput({ title: '   ' })).toThrow(ValidationError);
  });

  it('rejects a non-object body', () => {
    expect(() => parseCreateInput('nope')).toThrow(ValidationError);
  });

  it('rejects a title over 500 chars', () => {
    expect(() => parseCreateInput({ title: 'x'.repeat(501) })).toThrow(ValidationError);
  });
});

describe('parseUpdateInput', () => {
  it('accepts a title-only update', () => {
    expect(parseUpdateInput({ title: 'new' })).toEqual({ title: 'new' });
  });

  it('accepts a completed-only update', () => {
    expect(parseUpdateInput({ completed: true })).toEqual({ completed: true });
  });

  it('rejects an empty update', () => {
    expect(() => parseUpdateInput({})).toThrow(ValidationError);
  });

  it('rejects a non-boolean completed', () => {
    expect(() => parseUpdateInput({ completed: 'yes' })).toThrow(ValidationError);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm exec jest test/types.test.ts`
Expected: FAIL — cannot find module `../src/types`.

- [x] **Step 3: Write minimal implementation**

`backend/src/types.ts`:
```ts
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm exec jest test/types.test.ts`
Expected: PASS (9 tests).

- [x] **Step 5: Commit**

```bash
git add backend/src/types.ts backend/test/types.test.ts
git commit -m "feat: add todo types and input validation"
```

---

### Task 3: TodoRepository over DynamoDB

**Files:**
- Create: `backend/src/repository.ts`
- Test: `backend/test/repository.test.ts`

**Interfaces:**
- Consumes: `Todo`, `CreateTodoInput`, `UpdateTodoInput` from `./types`.
- Produces:
  - `class TodoRepository { constructor(client: DynamoDBDocumentClient, tableName: string) }`
  - `list(userId: string): Promise<Todo[]>`
  - `get(userId: string, todoId: string): Promise<Todo | null>`
  - `create(userId: string, input: CreateTodoInput): Promise<Todo>`
  - `update(userId: string, todoId: string, input: UpdateTodoInput): Promise<Todo | null>` (null if item absent)
  - `delete(userId: string, todoId: string): Promise<boolean>` (false if item absent)

- [x] **Step 1: Write the failing test**

`backend/test/repository.test.ts`:
```ts
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { TodoRepository } from '../src/repository';

const ddb = mockClient(DynamoDBDocumentClient);
const repo = new TodoRepository(ddb as unknown as DynamoDBDocumentClient, 'todos');

beforeEach(() => ddb.reset());

describe('TodoRepository', () => {
  it('list queries by userId', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ userId: 'u1', todoId: 't1' }] });
    const result = await repo.list('u1');
    expect(result).toHaveLength(1);
    const call = ddb.commandCalls(QueryCommand)[0].args[0].input;
    expect(call.ExpressionAttributeValues).toEqual({ ':u': 'u1' });
  });

  it('create writes an item with generated id and timestamps', async () => {
    ddb.on(PutCommand).resolves({});
    const todo = await repo.create('u1', { title: 'buy milk' });
    expect(todo.userId).toBe('u1');
    expect(todo.title).toBe('buy milk');
    expect(todo.completed).toBe(false);
    expect(todo.todoId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(todo.createdAt).toBe(todo.updatedAt);
    const item = ddb.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).toEqual(todo);
  });

  it('get returns null when item absent', async () => {
    ddb.on(GetCommand).resolves({});
    expect(await repo.get('u1', 'missing')).toBeNull();
  });

  it('update returns null when condition fails', async () => {
    const err = new Error('nope');
    err.name = 'ConditionalCheckFailedException';
    ddb.on(UpdateCommand).rejects(err);
    expect(await repo.update('u1', 'missing', { completed: true })).toBeNull();
  });

  it('update returns the new item', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { userId: 'u1', todoId: 't1', completed: true } });
    const result = await repo.update('u1', 't1', { completed: true });
    expect(result?.completed).toBe(true);
    const input = ddb.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.Key).toEqual({ userId: 'u1', todoId: 't1' });
    expect(input.ConditionExpression).toContain('attribute_exists');
  });

  it('delete returns false when condition fails', async () => {
    const err = new Error('nope');
    err.name = 'ConditionalCheckFailedException';
    ddb.on(DeleteCommand).rejects(err);
    expect(await repo.delete('u1', 'missing')).toBe(false);
  });

  it('delete returns true on success', async () => {
    ddb.on(DeleteCommand).resolves({});
    expect(await repo.delete('u1', 't1')).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm exec jest test/repository.test.ts`
Expected: FAIL — cannot find module `../src/repository`.

- [x] **Step 3: Write minimal implementation**

`backend/src/repository.ts`:
```ts
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { Todo, CreateTodoInput, UpdateTodoInput } from './types';

export class TodoRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async list(userId: string): Promise<Todo[]> {
    const res = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
      }),
    );
    return (res.Items ?? []) as Todo[];
  }

  async get(userId: string, todoId: string): Promise<Todo | null> {
    const res = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: { userId, todoId } }),
    );
    return (res.Item as Todo | undefined) ?? null;
  }

  async create(userId: string, input: CreateTodoInput): Promise<Todo> {
    const now = new Date().toISOString();
    const todo: Todo = {
      userId,
      todoId: ulid(),
      title: input.title,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.client.send(
      new PutCommand({ TableName: this.tableName, Item: todo }),
    );
    return todo;
  }

  async update(
    userId: string,
    todoId: string,
    input: UpdateTodoInput,
  ): Promise<Todo | null> {
    const sets = ['updatedAt = :now'];
    const values: Record<string, unknown> = { ':now': new Date().toISOString() };
    const names: Record<string, string> = {};
    if (input.title !== undefined) {
      sets.push('#title = :title');
      names['#title'] = 'title';
      values[':title'] = input.title;
    }
    if (input.completed !== undefined) {
      sets.push('completed = :completed');
      values[':completed'] = input.completed;
    }
    try {
      const res = await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { userId, todoId },
          UpdateExpression: `SET ${sets.join(', ')}`,
          ExpressionAttributeValues: values,
          ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
          ConditionExpression: 'attribute_exists(todoId)',
          ReturnValues: 'ALL_NEW',
        }),
      );
      return (res.Attributes as Todo | undefined) ?? null;
    } catch (err) {
      if ((err as Error).name === 'ConditionalCheckFailedException') return null;
      throw err;
    }
  }

  async delete(userId: string, todoId: string): Promise<boolean> {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { userId, todoId },
          ConditionExpression: 'attribute_exists(todoId)',
        }),
      );
      return true;
    } catch (err) {
      if ((err as Error).name === 'ConditionalCheckFailedException') return false;
      throw err;
    }
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm exec jest test/repository.test.ts`
Expected: PASS (7 tests).

- [x] **Step 5: Commit**

```bash
git add backend/src/repository.ts backend/test/repository.test.ts
git commit -m "feat: add TodoRepository over DynamoDB"
```

---

### Task 4: Lambda handler and route dispatcher

**Files:**
- Create: `backend/src/handler.ts`
- Test: `backend/test/router.test.ts`

**Interfaces:**
- Consumes: `TodoRepository` from `./repository`; `parseCreateInput`, `parseUpdateInput`, `ValidationError` from `./types`.
- Produces:
  - `async function route(event: APIGatewayProxyEvent, repo: TodoRepository): Promise<APIGatewayProxyResult>`
  - `const handler: APIGatewayProxyHandler` — production entry that builds a real repository from `process.env.TABLE_NAME` and delegates to `route`.
- Behavior: `userId = event.requestContext.authorizer.claims.sub`; `401` if absent. Routes on `httpMethod` × presence of `event.pathParameters.id`. Returns `400` for `ValidationError`/bad JSON, `404` for missing items, `500` otherwise. `204` responses have an empty body. No CORS headers (same-origin via CloudFront).

- [x] **Step 1: Write the failing test**

`backend/test/router.test.ts`:
```ts
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { route } from '../src/handler';
import { TodoRepository } from '../src/repository';

function fakeRepo(overrides: Partial<TodoRepository>): TodoRepository {
  return overrides as unknown as TodoRepository;
}

function event(partial: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    pathParameters: null,
    body: null,
    requestContext: { authorizer: { claims: { sub: 'u1' } } },
    ...partial,
  } as unknown as APIGatewayProxyEvent;
}

describe('route', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const res = await route(
      event({ requestContext: {} as never }),
      fakeRepo({}),
    );
    expect(res.statusCode).toBe(401);
  });

  it('GET /todos lists the caller\'s todos', async () => {
    const list = jest.fn().mockResolvedValue([{ todoId: 't1' }]);
    const res = await route(event({ httpMethod: 'GET' }), fakeRepo({ list }));
    expect(list).toHaveBeenCalledWith('u1');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([{ todoId: 't1' }]);
  });

  it('POST /todos creates and returns 201', async () => {
    const create = jest.fn().mockResolvedValue({ todoId: 't2', title: 'x' });
    const res = await route(
      event({ httpMethod: 'POST', body: JSON.stringify({ title: 'x' }) }),
      fakeRepo({ create }),
    );
    expect(create).toHaveBeenCalledWith('u1', { title: 'x' });
    expect(res.statusCode).toBe(201);
  });

  it('POST with invalid body returns 400', async () => {
    const res = await route(
      event({ httpMethod: 'POST', body: JSON.stringify({}) }),
      fakeRepo({ create: jest.fn() }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST with malformed JSON returns 400', async () => {
    const res = await route(
      event({ httpMethod: 'POST', body: '{not json' }),
      fakeRepo({ create: jest.fn() }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET /todos/{id} returns 404 when missing', async () => {
    const get = jest.fn().mockResolvedValue(null);
    const res = await route(
      event({ httpMethod: 'GET', pathParameters: { id: 't9' } }),
      fakeRepo({ get }),
    );
    expect(get).toHaveBeenCalledWith('u1', 't9');
    expect(res.statusCode).toBe(404);
  });

  it('PUT /todos/{id} updates and returns 200', async () => {
    const update = jest.fn().mockResolvedValue({ todoId: 't1', completed: true });
    const res = await route(
      event({ httpMethod: 'PUT', pathParameters: { id: 't1' }, body: JSON.stringify({ completed: true }) }),
      fakeRepo({ update }),
    );
    expect(update).toHaveBeenCalledWith('u1', 't1', { completed: true });
    expect(res.statusCode).toBe(200);
  });

  it('DELETE /todos/{id} returns 204 with empty body', async () => {
    const del = jest.fn().mockResolvedValue(true);
    const res = await route(
      event({ httpMethod: 'DELETE', pathParameters: { id: 't1' } }),
      fakeRepo({ delete: del }),
    );
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
  });

  it('DELETE missing item returns 404', async () => {
    const del = jest.fn().mockResolvedValue(false);
    const res = await route(
      event({ httpMethod: 'DELETE', pathParameters: { id: 't9' } }),
      fakeRepo({ delete: del }),
    );
    expect(res.statusCode).toBe(404);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm exec jest test/router.test.ts`
Expected: FAIL — `route` not exported from `../src/handler`.

- [x] **Step 3: Write minimal implementation**

`backend/src/handler.ts`:
```ts
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { TodoRepository } from './repository';
import { parseCreateInput, parseUpdateInput, ValidationError } from './types';

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: body === null ? '' : JSON.stringify(body),
  };
}

export async function route(
  event: APIGatewayProxyEvent,
  repo: TodoRepository,
): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext?.authorizer?.claims?.sub as string | undefined;
    if (!userId) return json(401, { message: 'unauthorized' });

    const id = event.pathParameters?.id;
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : undefined;

    if (method === 'GET' && !id) return json(200, await repo.list(userId));
    if (method === 'POST' && !id) {
      return json(201, await repo.create(userId, parseCreateInput(body)));
    }
    if (method === 'GET' && id) {
      const todo = await repo.get(userId, id);
      return todo ? json(200, todo) : json(404, { message: 'not found' });
    }
    if (method === 'PUT' && id) {
      const todo = await repo.update(userId, id, parseUpdateInput(body));
      return todo ? json(200, todo) : json(404, { message: 'not found' });
    }
    if (method === 'DELETE' && id) {
      const ok = await repo.delete(userId, id);
      return ok ? json(204, null) : json(404, { message: 'not found' });
    }
    return json(405, { message: 'method not allowed' });
  } catch (err) {
    if (err instanceof ValidationError) return json(400, { message: err.message });
    if (err instanceof SyntaxError) return json(400, { message: 'invalid JSON body' });
    console.error(err);
    return json(500, { message: 'internal server error' });
  }
}

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const repo = new TodoRepository(docClient, process.env.TABLE_NAME ?? '');

export const handler: APIGatewayProxyHandler = (event) => route(event, repo);
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm exec jest`
Expected: PASS (all suites: types, repository, router).

- [x] **Step 5: Verify the production bundle builds**

Run: `cd backend && pnpm run build && node -e "require('./dist/index.js').handler || process.exit(1)"`
Expected: exits 0; `dist/index.js` exists and exports `handler`.

- [x] **Step 6: Commit**

```bash
git add backend/src/handler.ts backend/test/router.test.ts
git commit -m "feat: add lambda handler and route dispatcher"
```

---

## Phase 2 — Infrastructure (Terraform)

> Terraform tasks verify with `terraform init -backend=false`, `fmt -check`, and `validate` (no AWS calls). Actual `apply` happens via CI or the manual bootstrap step. Run `terraform fmt` before committing each task.

### Task 5: Bootstrap module (remote state backend)

**Files:**
- Create: `infra/bootstrap/main.tf`

**Interfaces:**
- Produces (after manual apply): an S3 bucket for Terraform state and a DynamoDB table for state locking. Names are variables so the prod backend can reference them.

- [x] **Step 1: Write the bootstrap config**

`infra/bootstrap/main.tf`:
```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "state_bucket_name" {
  type = string
}

variable "lock_table_name" {
  type    = string
  default = "todo-tf-locks"
}

resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "locks" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"
  attribute {
    name = "LockID"
    type = "S"
  }
}

output "state_bucket_name" {
  value = aws_s3_bucket.state.id
}

output "lock_table_name" {
  value = aws_dynamodb_table.locks.name
}
```

- [x] **Step 2: Format and validate**

Run: `cd infra/bootstrap && terraform fmt && terraform init -backend=false && terraform validate`
Expected: `Success! The configuration is valid.`

- [x] **Step 3: Commit**

```bash
git add infra/bootstrap/main.tf
git commit -m "feat(infra): add terraform state bootstrap module"
```

---

### Task 6: Data module (DynamoDB table)

**Files:**
- Create: `infra/modules/data/main.tf`, `infra/modules/data/variables.tf`, `infra/modules/data/outputs.tf`

**Interfaces:**
- Consumes: `var.table_name`.
- Produces: `output.table_name`, `output.table_arn`.

- [x] **Step 1: Write the module**

`infra/modules/data/variables.tf`:
```hcl
variable "table_name" {
  type = string
}
```

`infra/modules/data/main.tf`:
```hcl
resource "aws_dynamodb_table" "todos" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "todoId"

  attribute {
    name = "userId"
    type = "S"
  }
  attribute {
    name = "todoId"
    type = "S"
  }
}
```

`infra/modules/data/outputs.tf`:
```hcl
output "table_name" {
  value = aws_dynamodb_table.todos.name
}

output "table_arn" {
  value = aws_dynamodb_table.todos.arn
}
```

- [x] **Step 2: Format and validate**

Run: `cd infra/modules/data && terraform fmt && terraform init -backend=false && terraform validate`
Expected: valid.

- [x] **Step 3: Commit**

```bash
git add infra/modules/data
git commit -m "feat(infra): add dynamodb data module"
```

---

### Task 7: Compute module (Lambda + IAM)

**Files:**
- Create: `infra/modules/compute/main.tf`, `infra/modules/compute/variables.tf`, `infra/modules/compute/outputs.tf`

**Interfaces:**
- Consumes: `var.function_name`, `var.table_name`, `var.table_arn`, `var.lambda_zip_path` (path to built artifact).
- Produces: `output.function_name`, `output.function_arn`, `output.invoke_arn` (for API Gateway integration).

- [x] **Step 1: Write the module**

`infra/modules/compute/variables.tf`:
```hcl
variable "function_name" {
  type = string
}
variable "table_name" {
  type = string
}
variable "table_arn" {
  type = string
}
variable "lambda_zip_path" {
  type = string
}
```

`infra/modules/compute/main.tf`:
```hcl
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "table_access" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
    ]
    resources = [var.table_arn]
  }
}

resource "aws_iam_role_policy" "table_access" {
  name   = "${var.function_name}-table-access"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.table_access.json
}

resource "aws_lambda_function" "todos" {
  function_name    = var.function_name
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      TABLE_NAME = var.table_name
    }
  }
}
```

`infra/modules/compute/outputs.tf`:
```hcl
output "function_name" {
  value = aws_lambda_function.todos.function_name
}
output "function_arn" {
  value = aws_lambda_function.todos.arn
}
output "invoke_arn" {
  value = aws_lambda_function.todos.invoke_arn
}
```

- [x] **Step 2: Format and validate**

Run: `cd infra/modules/compute && terraform fmt && terraform init -backend=false && terraform validate`
Expected: valid. (`filebase64sha256` is not evaluated at validate time.)

- [x] **Step 3: Commit**

```bash
git add infra/modules/compute
git commit -m "feat(infra): add lambda compute module"
```

---

### Task 8: Auth module (Cognito user pool)

**Files:**
- Create: `infra/modules/auth/main.tf`, `infra/modules/auth/variables.tf`, `infra/modules/auth/outputs.tf`

**Interfaces:**
- Consumes: `var.name_prefix`.
- Produces: `output.user_pool_id`, `output.user_pool_arn` (for the API Gateway authorizer), `output.user_pool_client_id` (public SPA client, no secret).

- [x] **Step 1: Write the module**

`infra/modules/auth/variables.tf`:
```hcl
variable "name_prefix" {
  type = string
}
```

`infra/modules/auth/main.tf`:
```hcl
resource "aws_cognito_user_pool" "this" {
  name = "${var.name_prefix}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_uppercase = true
    require_symbols   = false
  }
}

resource "aws_cognito_user_pool_client" "spa" {
  name         = "${var.name_prefix}-spa"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]
}
```

`infra/modules/auth/outputs.tf`:
```hcl
output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}
output "user_pool_arn" {
  value = aws_cognito_user_pool.this.arn
}
output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.spa.id
}
```

- [x] **Step 2: Format and validate**

Run: `cd infra/modules/auth && terraform fmt && terraform init -backend=false && terraform validate`
Expected: valid.

- [x] **Step 3: Commit**

```bash
git add infra/modules/auth
git commit -m "feat(infra): add cognito auth module"
```

---

### Task 9: API module (API Gateway REST + Cognito authorizer)

**Files:**
- Create: `infra/modules/api/main.tf`, `infra/modules/api/variables.tf`, `infra/modules/api/outputs.tf`

**Interfaces:**
- Consumes: `var.name_prefix`, `var.region`, `var.user_pool_arn`, `var.lambda_invoke_arn`, `var.lambda_function_name`.
- Produces: `output.api_id`, `output.stage_name` (= `api`), `output.invoke_domain` (host portion, e.g. `abc123.execute-api.us-east-1.amazonaws.com`) for the CloudFront origin.
- Design: two resources — `/todos` and `/todos/{id}` — each with an `ANY` method (COGNITO_USER_POOLS authorizer) and an `AWS_PROXY` integration to the single Lambda. Stage name is **`api`** so `/api/todos` maps cleanly through CloudFront.

- [x] **Step 1: Write the module**

`infra/modules/api/variables.tf`:
```hcl
variable "name_prefix" {
  type = string
}
variable "region" {
  type = string
}
variable "user_pool_arn" {
  type = string
}
variable "lambda_invoke_arn" {
  type = string
}
variable "lambda_function_name" {
  type = string
}
```

`infra/modules/api/main.tf`:
```hcl
resource "aws_api_gateway_rest_api" "this" {
  name = "${var.name_prefix}-api"
}

resource "aws_api_gateway_authorizer" "cognito" {
  name          = "cognito"
  type          = "COGNITO_USER_POOLS"
  rest_api_id   = aws_api_gateway_rest_api.this.id
  provider_arns = [var.user_pool_arn]
}

resource "aws_api_gateway_resource" "todos" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "todos"
}

resource "aws_api_gateway_resource" "todo_id" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.todos.id
  path_part   = "{id}"
}

# Collection: GET (list), POST (create)
resource "aws_api_gateway_method" "todos" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.todos.id
  http_method   = "ANY"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "todos" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.todos.id
  http_method             = aws_api_gateway_method.todos.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
}

# Item: GET, PUT, DELETE
resource "aws_api_gateway_method" "todo_id" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.todo_id.id
  http_method   = "ANY"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "todo_id" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.todo_id.id
  http_method             = aws_api_gateway_method.todo_id.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    redeploy = sha1(jsonencode([
      aws_api_gateway_resource.todos.id,
      aws_api_gateway_resource.todo_id.id,
      aws_api_gateway_method.todos.id,
      aws_api_gateway_method.todo_id.id,
      aws_api_gateway_integration.todos.id,
      aws_api_gateway_integration.todo_id.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "api" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  deployment_id = aws_api_gateway_deployment.this.id
  stage_name    = "api"
}
```

`infra/modules/api/outputs.tf`:
```hcl
output "api_id" {
  value = aws_api_gateway_rest_api.this.id
}
output "stage_name" {
  value = aws_api_gateway_stage.api.stage_name
}
output "invoke_domain" {
  value = "${aws_api_gateway_rest_api.this.id}.execute-api.${var.region}.amazonaws.com"
}
```

- [x] **Step 2: Format and validate**

Run: `cd infra/modules/api && terraform fmt && terraform init -backend=false && terraform validate`
Expected: valid.

- [x] **Step 3: Commit**

```bash
git add infra/modules/api
git commit -m "feat(infra): add api gateway module with cognito authorizer"
```

---

### Task 10: Frontend module (S3 + CloudFront + OAC)

**Files:**
- Create: `infra/modules/frontend/main.tf`, `infra/modules/frontend/variables.tf`, `infra/modules/frontend/outputs.tf`

**Interfaces:**
- Consumes: `var.name_prefix`, `var.bucket_name`, `var.api_invoke_domain`, `var.api_stage_name`.
- Produces: `output.bucket_name`, `output.distribution_id`, `output.distribution_domain` (the public URL host).
- Design: private S3 bucket with Origin Access Control; CloudFront with two origins — S3 (default behavior, cached) and API Gateway (`/api/*` behavior, caching disabled, all viewer headers forwarded so `Authorization` reaches the API). SPA fallback: 403/404 → `/index.html`.

- [x] **Step 1: Write the module**

`infra/modules/frontend/variables.tf`:
```hcl
variable "name_prefix" {
  type = string
}
variable "bucket_name" {
  type = string
}
variable "api_invoke_domain" {
  type = string
}
variable "api_stage_name" {
  type = string
}
```

`infra/modules/frontend/main.tf`:
```hcl
resource "aws_s3_bucket" "site" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name_prefix}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Managed policies
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}
data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  default_root_object = "index.html"

  origin {
    origin_id                = "s3"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  origin {
    origin_id   = "api"
    domain_name = var.api_invoke_domain
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "site" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site.json
}
```

`infra/modules/frontend/outputs.tf`:
```hcl
output "bucket_name" {
  value = aws_s3_bucket.site.id
}
output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}
output "distribution_domain" {
  value = aws_cloudfront_distribution.site.domain_name
}
```

- [x] **Step 2: Format and validate**

Run: `cd infra/modules/frontend && terraform fmt && terraform init -backend=false && terraform validate`
Expected: valid.

- [x] **Step 3: Commit**

```bash
git add infra/modules/frontend
git commit -m "feat(infra): add s3 + cloudfront frontend module"
```

---

### Task 11: Prod root environment (wire modules + remote state)

**Files:**
- Create: `infra/envs/prod/main.tf`, `infra/envs/prod/variables.tf`, `infra/envs/prod/outputs.tf`, `infra/envs/prod/backend.tf`, `infra/envs/prod/terraform.tfvars.example`

**Interfaces:**
- Consumes: outputs of all modules; `var.region`, `var.name_prefix`, `var.site_bucket_name`.
- Produces: root outputs consumed by CI/CD and the frontend build — `distribution_id`, `distribution_domain`, `site_bucket_name`, `user_pool_id`, `user_pool_client_id`.
- The Lambda artifact is built by `data.archive_file` in this root (zipping `backend/dist/index.js`) so plan/apply is self-contained once `backend` is built.

- [x] **Step 1: Write the backend + provider config**

`infra/envs/prod/backend.tf`:
```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Remote state. `bucket` and `region` are supplied at init time via
  # -backend-config (see README / CI). The lock table is created by infra/bootstrap.
  backend "s3" {
    key            = "prod/terraform.tfstate"
    dynamodb_table = "todo-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region
}
```

- [x] **Step 2: Write variables**

`infra/envs/prod/variables.tf`:
```hcl
variable "region" {
  type    = string
  default = "us-east-1"
}

variable "name_prefix" {
  type    = string
  default = "todo-prod"
}

variable "site_bucket_name" {
  type        = string
  description = "Globally-unique S3 bucket name for the frontend."
}
```

`infra/envs/prod/terraform.tfvars.example`:
```hcl
region           = "us-east-1"
name_prefix      = "todo-prod"
site_bucket_name = "todo-prod-site-CHANGE-ME"
```

- [x] **Step 3: Write the module wiring**

`infra/envs/prod/main.tf`:
```hcl
data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/../../../backend/dist/index.js"
  output_path = "${path.module}/../../../backend/dist/lambda.zip"
}

module "data" {
  source     = "../../modules/data"
  table_name = "${var.name_prefix}-todos"
}

module "compute" {
  source          = "../../modules/compute"
  function_name   = "${var.name_prefix}-todos"
  table_name      = module.data.table_name
  table_arn       = module.data.table_arn
  lambda_zip_path = data.archive_file.lambda.output_path
}

module "auth" {
  source      = "../../modules/auth"
  name_prefix = var.name_prefix
}

module "api" {
  source               = "../../modules/api"
  name_prefix          = var.name_prefix
  region               = var.region
  user_pool_arn        = module.auth.user_pool_arn
  lambda_invoke_arn    = module.compute.invoke_arn
  lambda_function_name = module.compute.function_name
}

module "frontend" {
  source            = "../../modules/frontend"
  name_prefix       = var.name_prefix
  bucket_name       = var.site_bucket_name
  api_invoke_domain = module.api.invoke_domain
  api_stage_name    = module.api.stage_name
}
```

`infra/envs/prod/outputs.tf`:
```hcl
output "distribution_id" {
  value = module.frontend.distribution_id
}
output "distribution_domain" {
  value = module.frontend.distribution_domain
}
output "site_bucket_name" {
  value = module.frontend.bucket_name
}
output "user_pool_id" {
  value = module.auth.user_pool_id
}
output "user_pool_client_id" {
  value = module.auth.user_pool_client_id
}
```

- [x] **Step 4: Format and validate (needs the backend build present)**

Run:
```bash
cd backend && pnpm run build && cd ../infra/envs/prod && terraform fmt && terraform init -backend=false && terraform validate
```
Expected: `Success! The configuration is valid.`

- [x] **Step 5: Commit**

```bash
git add infra/envs/prod
git commit -m "feat(infra): wire prod environment with remote state"
```

---

## Phase 3 — Frontend (Next.js static export)

### Task 12: Frontend scaffolding + Amplify config

**Files:**
- Create: `frontend/package.json`, `frontend/next.config.js`, `frontend/tsconfig.json`, `frontend/.env.example`, `frontend/src/lib/amplify.ts`, `frontend/src/app/layout.tsx`

**Interfaces:**
- Produces: a Next.js app that static-exports to `frontend/out`. `src/lib/amplify.ts` exports `configureAmplify()` reading `NEXT_PUBLIC_USER_POOL_ID` and `NEXT_PUBLIC_USER_POOL_CLIENT_ID`.

- [x] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "todo-frontend",
  "version": "1.0.0",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "next lint"
  },
  "dependencies": {
    "@aws-amplify/ui-react": "^6.1.12",
    "aws-amplify": "^6.3.0",
    "next": "^14.2.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.4",
    "typescript": "^5.4.5"
  }
}
```

- [x] **Step 2: Create `frontend/next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
};
module.exports = nextConfig;
```

- [x] **Step 3: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [x] **Step 4: Create `frontend/.env.example`**

```
NEXT_PUBLIC_USER_POOL_ID=us-east-1_xxxxxxxxx
NEXT_PUBLIC_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [x] **Step 5: Create `frontend/src/lib/amplify.ts`**

```ts
import { Amplify } from 'aws-amplify';

export function configureAmplify(): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
        userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
      },
    },
  });
}
```

- [x] **Step 6: Create `frontend/src/app/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import '@aws-amplify/ui-react/styles.css';

export const metadata = {
  title: 'Todo',
  description: 'Serverless todo app',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [x] **Step 7: Install**

Run: `cd frontend && pnpm install`
Expected: installs cleanly.

- [x] **Step 8: Commit**

```bash
git add frontend/package.json frontend/next.config.js frontend/tsconfig.json frontend/.env.example frontend/src/lib/amplify.ts frontend/src/app/layout.tsx frontend/pnpm-lock.yaml
git commit -m "feat(frontend): scaffold next.js static-export app with amplify config"
```

---

### Task 13: API client

**Files:**
- Create: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: `fetchAuthSession` from `aws-amplify/auth`.
- Produces:
  - `interface Todo { userId: string; todoId: string; title: string; completed: boolean; createdAt: string; updatedAt: string }`
  - `listTodos(): Promise<Todo[]>`
  - `createTodo(title: string): Promise<Todo>`
  - `updateTodo(id: string, patch: { title?: string; completed?: boolean }): Promise<Todo>`
  - `deleteTodo(id: string): Promise<void>`
- All requests go to same-origin `/api/todos...` with the Cognito **ID token** in `Authorization`.

- [x] **Step 1: Create the client**

`frontend/src/lib/api.ts`:
```ts
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
```

- [x] **Step 2: Type-check**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): add authenticated todo api client"
```

---

### Task 14: Auth-gated todo UI

**Files:**
- Create: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `configureAmplify` from `@/lib/amplify`; the API client from `@/lib/api`; `Authenticator`, `useAuthenticator` from `@aws-amplify/ui-react`.
- Produces: the app's single client-rendered page — sign-in/up via `<Authenticator>`, then list/create/toggle/edit/delete todos.

- [x] **Step 1: Create the page**

`frontend/src/app/page.tsx`:
```tsx
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
```

- [x] **Step 2: Verify the static export builds**

Run: `cd frontend && NEXT_PUBLIC_USER_POOL_ID=us-east-1_x NEXT_PUBLIC_USER_POOL_CLIENT_ID=x pnpm run build`
Expected: build succeeds and writes `frontend/out/index.html`.

- [x] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(frontend): add auth-gated todo UI"
```

---

## Phase 4 — CI/CD & docs

### Task 15: CI workflow (pull requests)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `secrets.AWS_PLAN_ROLE_ARN` (read-only role for `terraform plan`); repo vars `AWS_REGION`, `STATE_BUCKET_NAME`, `SITE_BUCKET_NAME`.
- Produces: PR gate — backend tests, frontend build, terraform fmt/validate/plan.

- [x] **Step 1: Create the workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
          cache-dependency-path: backend/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm test
      - run: pnpm run build

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run build
        env:
          NEXT_PUBLIC_USER_POOL_ID: placeholder
          NEXT_PUBLIC_USER_POOL_CLIENT_ID: placeholder

  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - name: Build lambda artifact (needed for archive_file)
        run: cd backend && pnpm install --frozen-lockfile && pnpm run build
      - uses: hashicorp/setup-terraform@v3
      - name: Format check
        run: terraform fmt -check -recursive infra
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_PLAN_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
      - name: Init
        working-directory: infra/envs/prod
        run: terraform init -backend-config="bucket=${{ vars.STATE_BUCKET_NAME }}" -backend-config="region=${{ vars.AWS_REGION }}"
      - name: Validate
        working-directory: infra/envs/prod
        run: terraform validate
      - name: Plan
        working-directory: infra/envs/prod
        run: terraform plan -var="region=${{ vars.AWS_REGION }}" -var="site_bucket_name=${{ vars.SITE_BUCKET_NAME }}"
```

- [x] **Step 2: Lint the YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
Expected: no output (valid YAML).

- [x] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add pull-request pipeline"
```

---

### Task 16: Deploy workflow (main)

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `secrets.AWS_DEPLOY_ROLE_ARN` (apply-capable role); repo vars `AWS_REGION`, `STATE_BUCKET_NAME`, `SITE_BUCKET_NAME`.
- Produces: on push to `main` — apply infra, build+deploy frontend using live Cognito outputs, invalidate CloudFront.

- [x] **Step 1: Create the workflow**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

concurrency:
  group: deploy-prod
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_wrapper: false

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Build lambda
        run: cd backend && pnpm install --frozen-lockfile && pnpm run build

      - name: Terraform init
        working-directory: infra/envs/prod
        run: terraform init -backend-config="bucket=${{ vars.STATE_BUCKET_NAME }}" -backend-config="region=${{ vars.AWS_REGION }}"

      - name: Terraform apply
        working-directory: infra/envs/prod
        run: terraform apply -auto-approve -var="region=${{ vars.AWS_REGION }}" -var="site_bucket_name=${{ vars.SITE_BUCKET_NAME }}"

      - name: Capture outputs
        id: tf
        working-directory: infra/envs/prod
        run: |
          echo "pool_id=$(terraform output -raw user_pool_id)" >> "$GITHUB_OUTPUT"
          echo "client_id=$(terraform output -raw user_pool_client_id)" >> "$GITHUB_OUTPUT"
          echo "bucket=$(terraform output -raw site_bucket_name)" >> "$GITHUB_OUTPUT"
          echo "dist_id=$(terraform output -raw distribution_id)" >> "$GITHUB_OUTPUT"

      - name: Build frontend
        working-directory: frontend
        env:
          NEXT_PUBLIC_USER_POOL_ID: ${{ steps.tf.outputs.pool_id }}
          NEXT_PUBLIC_USER_POOL_CLIENT_ID: ${{ steps.tf.outputs.client_id }}
        run: |
          pnpm install --frozen-lockfile
          pnpm run build

      - name: Sync to S3
        run: aws s3 sync frontend/out "s3://${{ steps.tf.outputs.bucket }}" --delete

      - name: Invalidate CloudFront
        run: aws cloudfront create-invalidation --distribution-id "${{ steps.tf.outputs.dist_id }}" --paths "/*"
```

- [x] **Step 2: Lint the YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"`
Expected: no output.

- [x] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add main-branch deploy pipeline"
```

---

### Task 17: README with bootstrap + OIDC setup

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: operator docs for the one-time manual steps CI can't do: bootstrap state, create the GitHub OIDC provider + roles, set repo vars/secrets, first deploy.

- [x] **Step 1: Write the README**

`README.md`:
````markdown
# Serverless Todo Web App

Per-user todo app on the AWS serverless "Web application" reference architecture:
Cognito → CloudFront → S3 → API Gateway → Lambda → DynamoDB. Frontend is a Next.js
static export; infra is Terraform; CI/CD is GitHub Actions with OIDC.

See `docs/superpowers/specs/2026-07-03-serverless-todo-webapp-design.md` for the design.

## Layout

- `backend/` — Lambda (TypeScript). `pnpm test`, `pnpm run build`.
- `frontend/` — Next.js static export. `pnpm run build` → `out/`.
- `infra/` — Terraform (`bootstrap`, `modules/*`, `envs/prod`).
- `.github/workflows/` — `ci.yml` (PRs), `deploy.yml` (main).

## One-time setup

### 1. Bootstrap remote state

```bash
cd infra/bootstrap
terraform init
terraform apply -var="state_bucket_name=<globally-unique-name>"
```

Note the `state_bucket_name` and `lock_table_name` outputs.

### 2. GitHub OIDC provider + roles

Create an IAM OIDC identity provider for `token.actions.githubusercontent.com`,
then two roles whose trust policy allows this repo:

- **Plan role** (used by `ci.yml`): read-only + `terraform plan` permissions.
- **Deploy role** (used by `deploy.yml`): permissions to manage DynamoDB, Lambda,
  IAM, Cognito, API Gateway, S3, CloudFront, and to read/write the state bucket and
  lock table.

### 3. Repo configuration

Set these in **Settings → Secrets and variables → Actions**:

Variables:
- `AWS_REGION` (e.g. `us-east-1`)
- `STATE_BUCKET_NAME` (from bootstrap)
- `SITE_BUCKET_NAME` (globally-unique bucket for the site)

Secrets:
- `AWS_PLAN_ROLE_ARN`
- `AWS_DEPLOY_ROLE_ARN`

### 4. First deploy

Push to `main`. `deploy.yml` applies infra, builds and uploads the frontend with the
live Cognito IDs, and invalidates CloudFront. The app is served at the CloudFront
distribution domain (`terraform output distribution_domain`).

## Prerequisites

- Node 20 (`.nvmrc`) and **pnpm 9** (`npm i -g pnpm` or via Corepack: `corepack enable`).

## Local development

- Backend: `cd backend && pnpm install && pnpm test`
- Frontend: `cd frontend && pnpm install && pnpm run dev` (set `NEXT_PUBLIC_*` in `.env.local`;
  API calls to `/api/*` require the deployed backend or a proxy).
````

- [x] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with bootstrap and OIDC setup"
```

---

## Self-Review notes (spec traceability)

- **Six components** — Cognito (Task 8), CloudFront (Task 10), S3 (Task 10), API Gateway (Task 9), Lambda (Tasks 4, 7), DynamoDB (Tasks 3, 6). ✅
- **Static export** — Task 12 (`output: 'export'`), build verified in Tasks 12/14. ✅
- **CloudFront fronts `/api/*`, no CORS** — Task 10 `ordered_cache_behavior`; frontend uses same-origin `/api` (Task 13); no CORS headers in handler (Task 4). ✅
- **Stage name `api`** — Task 9 stage; Task 13 base URL `/api/todos`. ✅
- **`userId` from JWT claims** — Task 4 route + tests. ✅
- **Per-user isolation** — DynamoDB keys (Tasks 3/6) + `userId` derivation (Task 4). ✅
- **CRUD API** — Tasks 3/4 (list/create/get/update/delete), tests in Tasks 3/4. ✅
- **Remote state S3 + DynamoDB lock** — Task 5 bootstrap, Task 11 backend block. ✅
- **OIDC, single prod** — Tasks 15/16 (`id-token: write`, role assumption), README Task 17. ✅
- **Testing strategy** — backend Jest (Tasks 2–4), frontend build (Tasks 12/14), terraform validate/plan (Tasks 5–11, 15). ✅
- **Error handling** — 400/401/404/500 covered in Task 4 tests. ✅

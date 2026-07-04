# Backend

The Lambda side of the [AWS reference architecture](../README.md): a single
function with an internal router handling all CRUD for the todo API, invoked
by API Gateway behind a Cognito authorizer.

## Stack

- Node.js 20, TypeScript
- AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)
- [esbuild](https://esbuild.github.io/) to bundle a single `dist/index.js` for deployment
- Jest + `aws-sdk-client-mock` for tests
- pnpm

## Structure

```
src/
├── handler.ts     # Lambda entry point + route(): method/path → repository call
├── repository.ts  # TodoRepository: DynamoDB Query/Get/Put/Update/Delete
└── types.ts       # Todo shape, input parsing/validation, ValidationError
test/
├── router.test.ts      # route() behavior per HTTP method
├── repository.test.ts  # TodoRepository against a mocked DynamoDB client
└── types.test.ts       # input validation edge cases
```

There is **one Lambda function**, not one per route — `route()` in
`handler.ts` dispatches on `event.httpMethod` and `event.pathParameters.id`.

## Ownership model

`userId` is read only from `event.requestContext.authorizer.claims.sub` — the
validated Cognito JWT claim set by API Gateway's authorizer. It is never
accepted from the request body or path.

```ts
const userId = event.requestContext?.authorizer?.claims?.sub as string | undefined;
if (!userId) return json(401, { message: 'unauthorized' });
```

DynamoDB keys are `userId` (partition key) + `todoId` (sort key), so every
read/write is naturally scoped to the caller — there's no cross-user query
path to guard against.

> [!IMPORTANT]
> Don't add a `userId` field to the request body or accept one as a path
> parameter, even for convenience in tests or tooling. Deriving it exclusively
> from the JWT is what keeps this a single-tenant-safe multi-tenant table.

## API shape

| Method | Path | Action |
|---|---|---|
| `GET` | `/todos` | List the caller's todos |
| `POST` | `/todos` | Create a todo (`{ title }`) |
| `GET` | `/todos/{id}` | Get one todo |
| `PUT` | `/todos/{id}` | Update a todo (`{ title?, completed? }`) |
| `DELETE` | `/todos/{id}` | Delete a todo |

Update/delete use a DynamoDB `ConditionExpression: attribute_exists(todoId)`
to return `404` on a missing item instead of silently succeeding.

## Local development

```bash
pnpm install
pnpm test              # jest
npx jest -t "<name>"   # run a single test by name
pnpm run lint
```

There's no local Lambda runtime here — tests exercise `route()` directly
against a mocked `TodoRepository` / DynamoDB client, which covers the routing
and validation logic without needing AWS credentials.

## Build & deploy

```bash
pnpm run build   # esbuild → dist/index.js (bundled, CommonJS, node20 target)
```

`deploy.yml` runs this build, then `infra/envs/prod` zips `dist/index.js` via
Terraform's `archive_file` data source and ships it as the Lambda's deployment
package — see [`infra/README.md`](../infra/README.md).

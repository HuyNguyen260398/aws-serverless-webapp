# Serverless Todo Web App — Design Spec

**Date:** 2026-07-03
**Status:** Approved (design), pending spec review

## Objective

A todo web application built entirely on AWS serverless services, with a Next.js
frontend, provisioned via Terraform, and deployed through GitHub Actions. The
architecture follows the AWS Well-Architected Serverless Applications Lens
"Web application" reference architecture exactly.

Reference:
- https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/web-application.html

## Decisions (locked)

| Area | Decision |
|------|----------|
| Frontend rendering | Next.js **static export** (`output: 'export'`) — pure HTML/CSS/JS on S3, served via CloudFront. Matches the doc's "S3 hosts static assets." |
| Feature scope | Core CRUD + auth. Per-user private todos: create, list, toggle complete, edit, delete. |
| Terraform state | Remote state in **S3** with **DynamoDB** state locking. |
| CI/CD AWS auth | **GitHub OIDC** — no long-lived access keys. |
| Environments | **Single (prod)**. PRs plan/validate; merge to `main` applies. |
| Backend language | **TypeScript / Node.js** (single ecosystem with the frontend). |
| Lambda shape | **One function** with light internal routing (doc: "An AWS Lambda function provides CRUD"). |
| API fronting | **CloudFront fronts the API** via an `/api/*` behavior — single domain, no CORS. |

## Reference architecture (the six components)

Each AWS service maps directly to the reference document:

1. **Amazon Cognito user pool** — user management + identity provider. Issues JWTs
   used to authenticate requests to API Gateway.
2. **Amazon CloudFront** — single public entry point / CDN. Accelerates delivery of
   static assets *and* calls to the backend compute layer.
3. **Amazon S3** — hosts static Next.js assets (HTML/CSS/JS/images), served securely
   through CloudFront (private bucket + Origin Access Control).
4. **Amazon API Gateway** — secure HTTPS REST endpoint. Cognito authorizer validates
   tokens before invoking Lambda.
5. **AWS Lambda** — a single function providing CRUD operations on DynamoDB.
6. **Amazon DynamoDB** — NoSQL data store, per-user data isolation.

### Request / data flow

```
                        ┌────────────── Amazon CloudFront ──────────────┐
                        │  default behavior  →  S3 (static Next.js)      │
  Browser (SPA) ───────▶│  /api/* behavior   →  API Gateway (REST)       │
        │               └───────────────────────────────────────────────┘
        │                                          │
        └── auth (JWT) ── Amazon Cognito           ▼
                          User Pool          API Gateway
                              ▲              (Cognito authorizer)
                              └── validates ──────│
                                                  ▼
                                            AWS Lambda (CRUD)
                                                  ▼
                                            Amazon DynamoDB
```

1. Browser loads the SPA from CloudFront (default behavior → S3, private via OAC).
2. User signs up / signs in against the Cognito user pool (AWS Amplify Auth in the SPA).
   Cognito returns JWT tokens.
3. SPA makes REST calls to `/api/*` on the same CloudFront domain; CloudFront forwards
   to API Gateway (no CORS needed — single origin). The JWT is sent in the
   `Authorization` header.
4. API Gateway's Cognito authorizer validates the token, then invokes the Lambda.
5. Lambda derives `userId` from the validated JWT claims and performs CRUD on DynamoDB.
6. DynamoDB returns data; response flows back through API Gateway → CloudFront → SPA.

## Repository structure

```
aws-serverless-webapp/
├── frontend/            # Next.js static export (TypeScript)
│                        #   Cognito auth via AWS Amplify Auth; calls /api/*
├── backend/             # Lambda source (TypeScript)
│                        #   single handler + router: create/list/get/update/delete
├── infra/
│   ├── bootstrap/       # one-time: S3 state bucket + DynamoDB lock table
│   ├── envs/prod/       # root module wiring the modules below
│   └── modules/
│       ├── data/        # DynamoDB table
│       ├── compute/     # Lambda + IAM (least-privilege to the table)
│       ├── api/         # API Gateway REST + Cognito authorizer + routes
│       ├── auth/        # Cognito user pool + app client
│       └── frontend/    # S3 bucket + CloudFront + OAC + /api behavior
├── .github/workflows/
│   ├── ci.yml           # PR: lint, test, terraform validate/plan
│   └── deploy.yml       # main: terraform apply, package Lambda, deploy frontend
└── docs/superpowers/specs/
```

Each Terraform module has a single purpose and communicates through its declared
outputs. Backend and frontend share one TypeScript toolchain.

## Data model

**DynamoDB table `todos`** (single-table, on-demand billing):

- Partition key: `userId` (Cognito `sub`)
- Sort key: `todoId` (ULID, sortable by creation time)
- Attributes: `title` (string), `completed` (bool), `createdAt` (ISO), `updatedAt` (ISO)

Access patterns:
- List: `Query` by `userId`.
- Get / Update / Delete: by `userId` + `todoId`.

**Data isolation:** the Lambda always derives `userId` from the validated JWT claims,
never from the request body. A user therefore cannot read or write another user's
items — ownership is enforced structurally by the key.

## API contract

All routes sit behind the API Gateway Cognito authorizer.

| Method | Path            | Purpose                         | Success |
|--------|-----------------|---------------------------------|---------|
| GET    | `/todos`        | List caller's todos             | 200     |
| POST   | `/todos`        | Create a todo (`{title}`)       | 201     |
| GET    | `/todos/{id}`   | Read one todo                   | 200     |
| PUT    | `/todos/{id}`   | Update (`{title?, completed?}`) | 200     |
| DELETE | `/todos/{id}`   | Delete a todo                   | 204     |

## Error handling

- Invalid/missing body or fields → `400` with a JSON error message.
- Missing token / invalid token → `401` (handled by the Cognito authorizer before
  Lambda runs).
- Todo not found, or belonging to another user → `404`.
- Unexpected failures → `500` (details logged to CloudWatch, not returned to client).

## Testing strategy

- **Backend:** Jest unit tests for the handler/router, DynamoDB mocked with
  `aws-sdk-client-mock`. Cover each CRUD path, validation errors, and ownership
  enforcement.
- **Frontend:** lint + `next build` (static export) must succeed in CI.
- **Infrastructure:** `terraform fmt -check`, `terraform validate`, and
  `terraform plan` run on every PR.

## CI/CD (single prod, GitHub OIDC)

**`ci.yml` (pull requests):**
- Backend: install, lint, unit test.
- Frontend: install, lint, `next build`.
- Infra: `terraform fmt -check`, `validate`, `plan` (read-only role via OIDC).

**`deploy.yml` (push to `main`):**
1. Assume AWS deploy role via GitHub OIDC (no static credentials).
2. `terraform apply` (infra/envs/prod).
3. Build & package the Lambda; deployed via Terraform.
4. `next build` → static export; `aws s3 sync` the output to the S3 bucket.
5. CloudFront cache invalidation (`/*`).

**Bootstrap:** `infra/bootstrap` (state S3 bucket + DynamoDB lock table) is applied
once, manually, before the first pipeline run. Documented in the README.

## Out of scope (YAGNI)

- Server-side rendering / Next.js SSR compute.
- Multiple environments (dev/staging) — single prod only.
- Extra product features (due dates, priorities, labels, sharing).
- Custom domain / ACM certificate (can be added later without architectural change).
- API Gateway usage plans / per-user throttling tiers.

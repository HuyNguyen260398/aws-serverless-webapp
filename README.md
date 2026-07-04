# Serverless Todo Web App

A per-user todo application built entirely on AWS serverless services, following the
[AWS Well-Architected Serverless Applications Lens — *Web application*](https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/web-application.html)
reference architecture, with a Next.js frontend, Terraform infrastructure-as-code, and
GitHub Actions CI/CD.

> [!NOTE]
> The application, infrastructure, and CI/CD code are implemented. The architecture,
> data model, and step-by-step build plan are specified under [`docs/`](docs/).

## Why serverless

- **Scales to zero and to millions** — no servers to provision or auto-scaling policies to tune.
- **Pay for what you use** — on-demand DynamoDB, per-request Lambda, no idle cost.
- **Managed and global by default** — CloudFront edge delivery, managed identity via Cognito.

## Architecture

The app maps one-to-one to the six components of the AWS reference architecture.

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

| Component | Service | Role |
|-----------|---------|------|
| Auth | **Amazon Cognito** | User sign-up/sign-in; issues JWTs that authenticate API requests |
| CDN / entry point | **Amazon CloudFront** | Serves the SPA and fronts the REST API on a single origin |
| Static hosting | **Amazon S3** | Hosts the Next.js static export (private bucket, Origin Access Control) |
| API | **Amazon API Gateway** | HTTPS REST endpoint with a Cognito authorizer |
| Compute | **AWS Lambda** | Single function performing CRUD, with per-user data isolation |
| Data | **Amazon DynamoDB** | NoSQL store, keyed by `userId` + `todoId` |

Because CloudFront fronts both the SPA and the API (via an `/api/*` behavior), the
frontend is **same-origin** with the API — no CORS required.

## Features

- Email/password authentication with Amazon Cognito.
- Private, per-user todos: create, list, toggle complete, edit, and delete.
- Ownership enforced structurally — the API derives the user from the validated JWT,
  never from the request body.

## Tech stack

- **Frontend:** Next.js (static export) + TypeScript, AWS Amplify for auth
- **Backend:** AWS Lambda (Node.js 20, TypeScript), AWS SDK v3
- **Infrastructure:** Terraform (AWS provider), remote state in S3 + DynamoDB lock
- **CI/CD:** GitHub Actions with AWS OIDC (no long-lived credentials)
- **Package manager:** pnpm

## Project structure

```
.
├── backend/        # Lambda source (TypeScript) + tests
├── frontend/       # Next.js static-export SPA
├── infra/          # Terraform: bootstrap, reusable modules, prod environment
├── .github/        # CI (pull requests) and deploy (main) workflows
└── docs/           # Design spec and implementation plan
```

## Getting started

> [!IMPORTANT]
> Requires **Node.js 20** (see `.nvmrc`), **pnpm 9**, **Terraform ≥ 1.6**, and AWS
> credentials with permission to create the resources above.

The full design and task-by-task plan live under [`docs/`](docs/):

- **Design:** [`docs/superpowers/specs/2026-07-03-serverless-todo-webapp-design.md`](docs/superpowers/specs/2026-07-03-serverless-todo-webapp-design.md)
- **Implementation plan:** [`docs/superpowers/plans/2026-07-03-serverless-todo-webapp.md`](docs/superpowers/plans/2026-07-03-serverless-todo-webapp.md)

### Local development

- **Backend:** `cd backend && pnpm install && pnpm test` (build the Lambda bundle with `pnpm run build`).
- **Frontend:** `cd frontend && pnpm install && pnpm run dev`. Set `NEXT_PUBLIC_USER_POOL_ID`
  and `NEXT_PUBLIC_USER_POOL_CLIENT_ID` in `.env.local` (see `.env.example`); calls to
  `/api/*` require the deployed backend (or a proxy) since the app is same-origin with the API.

### One-time setup

These manual steps bootstrap state and wire up OIDC before the pipeline can run.

**1. Bootstrap remote state** — creates the Terraform state bucket and lock table:

```bash
cd infra/bootstrap
terraform init
terraform apply -var="state_bucket_name=<globally-unique-name>"
```

Note the `state_bucket_name` and `lock_table_name` outputs.

**2. GitHub OIDC provider + roles** — create an IAM OIDC identity provider for
`token.actions.githubusercontent.com`, then two roles whose trust policy allows this repo:

- **Plan role** (used by `ci.yml`): read-only + `terraform plan` permissions.
- **Deploy role** (used by `deploy.yml`): permissions to manage DynamoDB, Lambda, IAM,
  Cognito, API Gateway, S3, and CloudFront, plus read/write on the state bucket and lock table.

**3. Repository configuration** — in **Settings → Secrets and variables → Actions**:

- Variables: `AWS_REGION`, `STATE_BUCKET_NAME` (from bootstrap), `SITE_BUCKET_NAME` (globally-unique bucket for the site).
- Secrets: `AWS_PLAN_ROLE_ARN`, `AWS_DEPLOY_ROLE_ARN`.

**4. First deploy** — push to `main`. `deploy.yml` applies infrastructure, builds and
uploads the frontend with the live Cognito IDs, and invalidates the CloudFront cache.
The app is served at the CloudFront distribution domain (`terraform output distribution_domain`).

## Documentation

- [Design spec](docs/superpowers/specs/2026-07-03-serverless-todo-webapp-design.md) — architecture, data model, API contract, error handling.
- [Implementation plan](docs/superpowers/plans/2026-07-03-serverless-todo-webapp.md) — 17 bite-sized, test-driven tasks across backend, infrastructure, frontend, and CI/CD.

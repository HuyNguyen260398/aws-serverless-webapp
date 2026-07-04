# Serverless Todo Web App

A per-user todo application built entirely on AWS serverless services, following the
[AWS Well-Architected Serverless Applications Lens — *Web application*](https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/web-application.html)
reference architecture, with a Next.js frontend, Terraform infrastructure-as-code, and
GitHub Actions CI/CD.

> [!NOTE]
> This repo is meant to be **forked and deployed under your own AWS account and
> GitHub repo**. Nothing in the tracked files is specific to the original author —
> every account ID, region, and resource name is supplied by you via Terraform
> variables and GitHub Actions repo variables/secrets. Follow
> [Setup](#setup) below end to end.

## Why serverless

- **Scales to zero and to millions** — no servers to provision or auto-scaling policies to tune.
- **Pay for what you use** — on-demand DynamoDB, per-request Lambda, no idle cost.
- **Managed and global by default** — CloudFront edge delivery, managed identity via Cognito.

## Architecture

The app maps one-to-one to the six components of the AWS reference architecture.
See [`docs/architecture.md`](docs/architecture.md) for a full breakdown plus
Mermaid sequence and CI/CD workflow diagrams.

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
└── docs/           # Architecture diagrams (docs/architecture.md)
```

## Setup

### 1. Prerequisites

Install these before you start:

| Tool | Version | Install |
|---|---|---|
| Node.js | 20.x (see `.nvmrc`) | [nodejs.org](https://nodejs.org/) or `nvm install` |
| pnpm | 9.x | `corepack enable && corepack prepare pnpm@9 --activate` |
| Terraform | >= 1.6 | [developer.hashicorp.com/terraform/install](https://developer.hashicorp.com/terraform/install) |
| AWS CLI | v2 | [docs.aws.amazon.com/cli](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) |
| GitHub CLI (optional, for the `gh` commands below) | any recent | [cli.github.com](https://cli.github.com/) |

You'll also need:
- An **AWS account** with permission to create IAM roles/OIDC providers, S3
  buckets, DynamoDB tables, Lambda functions, Cognito user pools, API Gateway
  APIs, and CloudFront distributions.
- A **GitHub repo** you own (fork this repo, or push it to a new repo under
  your account/org) — the CI/CD steps below need `<GITHUB_OWNER>/<GITHUB_REPO>`.

Confirm your local AWS CLI is authenticated to the right account before continuing:

```bash
aws sts get-caller-identity
```

Note the `Account` value in the output — you'll need it below as `<AWS_ACCOUNT_ID>`.

### 2. Bootstrap Terraform remote state

This is a **one-time, manual** step (chicken-and-egg: the pipeline needs remote
state to exist before it can run `terraform init` for the real infrastructure).

```bash
cd infra/bootstrap
terraform init
terraform apply \
  -var="region=<YOUR_AWS_REGION>" \
  -var="state_bucket_name=<globally-unique-bucket-name>"
```

Note the two outputs — you'll use them in step 4:

```bash
terraform output state_bucket_name   # e.g. todo-prod-tfstate-<AWS_ACCOUNT_ID>
terraform output lock_table_name     # defaults to "todo-tf-locks"
```

### 3. Create the GitHub OIDC provider and IAM roles

CI/CD authenticates to AWS via **GitHub OIDC** — there are no long-lived AWS
access keys anywhere. Create the OIDC identity provider once per AWS account
(skip this if your account already has one for `token.actions.githubusercontent.com`):

```bash
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"
```

Then create two IAM roles that trust this repo specifically. Replace
`<AWS_ACCOUNT_ID>` and `<GITHUB_OWNER>/<GITHUB_REPO>` throughout.

**Trust policy** (same shape for both roles — save as `trust-policy.json`,
adjust the `sub` condition per role as shown):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<GITHUB_OWNER>/<GITHUB_REPO>:*"
        }
      }
    }
  ]
}
```

> Tighten the `sub` condition per role if you want tighter scoping, e.g.
> `repo:<GITHUB_OWNER>/<GITHUB_REPO>:pull_request` for the plan role and
> `repo:<GITHUB_OWNER>/<GITHUB_REPO>:ref:refs/heads/main` for the deploy role.

**Plan role** (used by `ci.yml` — read-only + `terraform plan`):

```bash
aws iam create-role \
  --role-name todo-ci-plan-role \
  --assume-role-policy-document file://trust-policy.json

aws iam attach-role-policy \
  --role-name todo-ci-plan-role \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
```

**Deploy role** (used by `deploy.yml` — manages every resource this stack
creates, plus read/write on the state bucket and lock table):

```bash
aws iam create-role \
  --role-name todo-ci-deploy-role \
  --assume-role-policy-document file://trust-policy.json
```

Attach an inline policy scoped to what `terraform apply` in this repo actually
touches (save as `deploy-policy.json`, replace placeholders, then attach):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:*",
        "lambda:*",
        "cognito-idp:*",
        "apigateway:*",
        "cloudfront:*",
        "logs:*",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:TagRole",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:*"],
      "Resource": [
        "arn:aws:s3:::<SITE_BUCKET_NAME>",
        "arn:aws:s3:::<SITE_BUCKET_NAME>/*",
        "arn:aws:s3:::<STATE_BUCKET_NAME>",
        "arn:aws:s3:::<STATE_BUCKET_NAME>/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"],
      "Resource": "arn:aws:dynamodb:<AWS_REGION>:<AWS_ACCOUNT_ID>:table/<LOCK_TABLE_NAME>"
    }
  ]
}
```

```bash
aws iam put-role-policy \
  --role-name todo-ci-deploy-role \
  --policy-name todo-ci-deploy-policy \
  --policy-document file://deploy-policy.json
```

> This is intentionally broad within each service (`dynamodb:*`, `lambda:*`, etc.)
> rather than enumerated per-action, since Terraform needs create/read/update/
> delete/tag permissions across the full resource lifecycle. Narrow it further
> once deployed if your organization requires stricter least-privilege.

Note the two role ARNs (`arn:aws:iam::<AWS_ACCOUNT_ID>:role/todo-ci-plan-role`
and `.../todo-ci-deploy-role`) — you need them in the next step.

### 4. Configure the GitHub repository

In **Settings → Secrets and variables → Actions** (or via `gh` CLI below), set:

**Variables** (`gh variable set NAME --body "value"` or the UI "Variables" tab):

| Name | Value |
|---|---|
| `AWS_REGION` | the region you bootstrapped in step 2, e.g. `us-east-1` |
| `STATE_BUCKET_NAME` | `terraform output state_bucket_name` from step 2 |
| `LOCK_TABLE_NAME` | `terraform output lock_table_name` from step 2 |
| `SITE_BUCKET_NAME` | a **new**, globally-unique bucket name for the frontend (Terraform creates it) |

**Secrets** (`gh secret set NAME --body "value"` or the UI "Secrets" tab):

| Name | Value |
|---|---|
| `AWS_PLAN_ROLE_ARN` | the plan role ARN from step 3 |
| `AWS_DEPLOY_ROLE_ARN` | the deploy role ARN from step 3 |

Example using the GitHub CLI:

```bash
gh variable set AWS_REGION --body "us-east-1"
gh variable set STATE_BUCKET_NAME --body "todo-prod-tfstate-<AWS_ACCOUNT_ID>"
gh variable set LOCK_TABLE_NAME --body "todo-tf-locks"
gh variable set SITE_BUCKET_NAME --body "todo-prod-site-<AWS_ACCOUNT_ID>"
gh secret set AWS_PLAN_ROLE_ARN --body "arn:aws:iam::<AWS_ACCOUNT_ID>:role/todo-ci-plan-role"
gh secret set AWS_DEPLOY_ROLE_ARN --body "arn:aws:iam::<AWS_ACCOUNT_ID>:role/todo-ci-deploy-role"
```

### 5. First deploy

Push to `main` (or merge a PR into it). This triggers `deploy.yml`, which:

1. Assumes `AWS_DEPLOY_ROLE_ARN` via GitHub OIDC (no static credentials).
2. Builds the Lambda bundle (`backend`: `pnpm install` + `pnpm run build`).
3. Runs `terraform init` against your state bucket/lock table, then
   `terraform apply` for `infra/envs/prod` — this creates the Cognito user
   pool, DynamoDB table, Lambda function + IAM role, API Gateway REST API, and
   the S3 bucket + CloudFront distribution.
4. Captures the live `user_pool_id`, `user_pool_client_id`, `site_bucket_name`,
   and `distribution_id` from `terraform output`.
5. Builds the frontend (`next build`, static export) with those Cognito IDs
   injected as `NEXT_PUBLIC_*` env vars.
6. Syncs the build output to the S3 bucket (`aws s3 sync ... --delete`).
7. Invalidates the CloudFront cache (`aws cloudfront create-invalidation --paths "/*"`).

Once it finishes, get the live URL:

```bash
cd infra/envs/prod
terraform init -backend-config="bucket=<STATE_BUCKET_NAME>" \
                -backend-config="region=<AWS_REGION>" \
                -backend-config="dynamodb_table=<LOCK_TABLE_NAME>"
terraform output distribution_domain
```

Open `https://<that-domain>` and sign up with any email — Cognito emails a
verification code — to start using the app.

### How CI/CD works

- **`ci.yml`** (every pull request): lints/tests/builds the backend, lints/builds
  the frontend (with placeholder Cognito env vars, since no infra changes
  happen on a PR), and runs `terraform fmt -check`, `terraform validate`, and
  `terraform plan` using the **plan role** (read-only) — so PRs show what would
  change without being able to change anything.
- **`deploy.yml`** (push to `main`): runs the full apply-and-ship sequence
  described in step 5 above, using the **deploy role**.
- There is a single environment (**prod**) — no dev/staging split. See
  [`docs/architecture.md`](docs/architecture.md) for the full sequence and
  workflow diagrams.

### Local development

- **Backend:** `cd backend && pnpm install && pnpm test` (build the Lambda bundle with `pnpm run build`).
- **Frontend:** `cd frontend && pnpm install && pnpm run dev`. Set `NEXT_PUBLIC_USER_POOL_ID`
  and `NEXT_PUBLIC_USER_POOL_CLIENT_ID` in `.env.local` (see `.env.example`, and
  `terraform output user_pool_id` / `user_pool_client_id` from your deployed
  stack); calls to `/api/*` require the deployed backend (or a proxy) since the
  app is same-origin with the API.
- **Infra (local plan, optional):** copy `infra/envs/prod/terraform.tfvars.example`
  to `terraform.tfvars` and fill in your `region`/`site_bucket_name` to run
  `terraform plan` locally against your bootstrapped state.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — AWS services table, Mermaid
  sequence diagram (auth + CRUD request flow), and Mermaid workflow diagram
  (the `deploy.yml` pipeline).

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repo is in the **design phase**. No application code exists yet — the only
content is the approved design spec at
`docs/superpowers/specs/2026-07-03-serverless-todo-webapp-design.md`, which is the
**source of truth** for architecture and scope. Read it before implementing. The
directory layout, commands, and modules described below are the *intended* structure
from that spec; create them as you build, and update this file when they become real.

## What this is

A todo web app built entirely on AWS serverless services. The defining constraint:
it must follow the AWS Well-Architected Serverless Applications Lens **"Web application"
reference architecture exactly** — six components, each in its documented role:

Cognito (auth) → CloudFront (CDN/entry point) → S3 (static frontend) →
API Gateway (REST + Cognito authorizer) → Lambda (single CRUD function) → DynamoDB.

Ref: https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/web-application.html

## Architecture constraints (non-obvious, easy to violate)

These are deliberate decisions from the spec. Do not "improve" past them without
revisiting the spec:

- **Next.js is static-export only** (`output: 'export'`). No SSR, no server compute
  for the frontend — the doc requires S3 to host static assets. Anything needing a
  Next.js server is out of bounds.
- **CloudFront fronts both origins.** Default behavior → S3; an `/api/*` behavior →
  API Gateway. Because the SPA and API share one origin, the frontend calls
  **same-origin `/api/...`** and there is **no CORS** to configure. Don't add CORS
  handling or point the frontend at the raw API Gateway URL.
- **Lambda is a single function** with internal routing (the doc says "An AWS Lambda
  function provides CRUD"), not one function per route.
- **`userId` comes only from the validated JWT claims**, never from the request body
  or path. This is the ownership/isolation invariant — DynamoDB keys are
  `userId` (PK) + `todoId` (SK), so deriving `userId` from the token is what keeps
  users out of each other's data.
- **Single environment (prod).** No dev/staging. GitHub Actions authenticates to AWS
  via **OIDC** — there are no long-lived AWS access keys anywhere.

## Intended layout

- `frontend/` — Next.js static export (TypeScript); Cognito auth via AWS Amplify Auth.
- `backend/` — Lambda source (TypeScript); one handler + router for create/list/get/update/delete.
- `infra/bootstrap/` — one-time: S3 Terraform-state bucket + DynamoDB lock table.
  Applied **manually, once**, before any pipeline run (chicken-and-egg with remote state).
- `infra/envs/prod/` — root module wiring the modules below.
- `infra/modules/{data,compute,api,auth,frontend}/` — one purpose each, communicate via outputs.
- `.github/workflows/ci.yml` (PRs: lint/test/`terraform plan`) and `deploy.yml`
  (push to `main`: `terraform apply`, package Lambda, `next build` + `s3 sync`,
  CloudFront invalidation).

## Commands

No build/test tooling exists yet; establish these as the packages are created.
Backend and frontend both use TypeScript/Node (single toolchain). Expected once built:

- Backend tests: Jest with `aws-sdk-client-mock` for DynamoDB. Run a single test with
  `npx jest -t "<test name>"` (or `<file>`).
- Frontend: `next build` produces the static export deployed to S3.
- Infra: `terraform fmt -check`, `terraform validate`, `terraform plan` gate every PR.

## Working in this repo

- The repo has **no git remote** yet — work is committed locally on a worktree branch.
  If a remote is added later, PRs become possible.
- The initial `main` commit is an empty bootstrap commit created only to enable
  worktree isolation.

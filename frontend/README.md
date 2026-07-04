# Frontend

Next.js static-export SPA for the todo app. It's the S3-hosted layer of the
[AWS reference architecture](../README.md) — Cognito for auth, `/api/*` calls
routed same-origin through CloudFront to the backend Lambda.

## Stack

- [Next.js 14](https://nextjs.org/) (`output: 'export'` — static HTML/CSS/JS, no server runtime)
- TypeScript, Tailwind CSS
- [AWS Amplify](https://docs.amplify.aws/react/build-a-backend/auth/) for Cognito sign-up/sign-in and session tokens
- pnpm

> [!IMPORTANT]
> `next.config.js` sets `output: 'export'`. Nothing here can depend on a Next.js
> server (no API routes, no SSR, no middleware) — the reference architecture
> requires the frontend to be static assets served from S3.

## Structure

```
src/
├── app/            # App Router: layout, page, global styles
├── components/     # Todo list UI (form, item, filters, theme toggle, etc.)
└── lib/
    ├── amplify.ts       # Amplify.configure() with the Cognito user pool
    ├── amplifyTheme.ts  # Amplify UI theme overrides
    ├── api.ts           # fetch wrapper for /api/todos, attaches the Cognito ID token
    └── theme.tsx        # light/dark theme context
```

`lib/api.ts` calls `/api/todos` — a relative, same-origin path. There is no
CORS handling and no direct API Gateway URL anywhere in the frontend, because
CloudFront fronts both the site and the API on one origin.

## Local development

```bash
pnpm install
pnpm run dev
```

Copy `.env.example` to `.env.local` and fill in a deployed stack's Cognito IDs
(`terraform output user_pool_id` / `user_pool_client_id` from `infra/envs/prod`):

```
NEXT_PUBLIC_USER_POOL_ID=us-east-1_xxxxxxxxx
NEXT_PUBLIC_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

> [!NOTE]
> `pnpm run dev` gets you sign-in and the UI shell running locally, but
> `/api/todos` calls need a real backend to answer them — either the deployed
> API Gateway stage or a local proxy in front of it. There's no mock API in
> this repo.

## Commands

| Command | Purpose |
|---|---|
| `pnpm run dev` | Start the Next.js dev server |
| `pnpm run build` | Static export to `out/` — what CI/CD syncs to S3 |
| `pnpm run lint` | `next lint` |

## Deployment

Not done from here directly. `deploy.yml` runs `pnpm run build` with the live
Cognito IDs injected as `NEXT_PUBLIC_*` env vars (captured from that run's
`terraform apply`), then `aws s3 sync`s `out/` to the site bucket and
invalidates CloudFront. See the [root README](../README.md#5-first-deploy) for
the full pipeline.

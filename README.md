# HTA Multifamily Invoicing Tracker

Owner draw and subcontractor invoice tracking for HTA Construction & Development multifamily projects.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres) via `@supabase/supabase-js`
- Deployed on Vercel

## Structure

```
app/
  page.tsx                 dashboard (project rollups)
  login/                   passcode entry page
  projects/[id]/           project detail (draws + sub invoices tabs)
  draws/actions.ts         server actions for inv_owner_draws
  invoices/actions.ts      server actions for inv_sub_invoices
  api/login, api/logout    passcode session endpoints
lib/
  auth/session.ts          shared-passcode session token (signed, HMAC)
  supabase/                server + browser Supabase clients
  types.ts                 shared domain types
  data.ts                  read queries + dashboard rollups
components/                UI components
middleware.ts              passcode session gate
```

## Auth

Single shared passcode (`SITE_PASSCODE` env var). Entering it on `/login` sets a
signed, httpOnly session cookie; `middleware.ts` checks it on every request.
All auth logic lives in `lib/auth/session.ts` and `middleware.ts` so it can be
swapped for real per-user auth later without touching app routes.

## Data model

All tables are prefixed `inv_` so they can coexist in a shared database
(e.g. if this app is later merged into `hta-accounting-portal`):

- `inv_projects`
- `inv_owner_draws` — pay applications submitted to lender/owner
- `inv_sub_invoices` — subcontractor invoices to HTA

RLS is enabled with permissive policies since app-level access is already
gated by the passcode middleware, not per-row Supabase auth.

## Environment variables

See `.env.local.example`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SITE_PASSCODE`

## Development

```bash
npm install
npm run dev
```

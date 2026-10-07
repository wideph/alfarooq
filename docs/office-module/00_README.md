# Office Module — Agent Entry Point

**Read this file first.** Then read the others in numeric order. Never start coding
before reading `05_AGENT_LOG.md` (to see where the last agent stopped) and
`04_ROADMAP.md` (to see which task is next).

## What this module is

A **case / payment / commission management system** ("Office Module") added as a
sub-part of the existing Alfarooq Services Next.js project.

- Same PostgreSQL database (Supabase, via Prisma) as the public website.
- Same login system (`Admin` table, `admin_session` JWT cookie).
- **Different file storage: Cloudflare R2** (S3-compatible). The public website keeps
  using Supabase Storage. Office files (payment slips etc.) go to R2 only.
- Lives under `/office/*` (pages) and `/api/office/*` (API routes).
- Super admin (existing `role = "admin"`) manages everything from `/admin` (new
  "Office" nav item) and `/office/setup`.

## Document map

| File | Purpose |
|------|---------|
| `00_README.md` | This file. Rules for agents. |
| `01_REQUIREMENTS.md` | Exact requirements as given by the owner (source of truth). |
| `02_ARCHITECTURE.md` | Folder layout, auth/role design, storage, data model (Prisma). |
| `03_BUSINESS_RULES.md` | Payment flow, commission maths, profit share, income report, working-day (AI) rule. |
| `04_ROADMAP.md` | Phased task list with checkboxes. Work top to bottom. |
| `05_AGENT_LOG.md` | Append-only log. Every agent writes what it did and where it stopped. |

## Rules for every agent

1. **Log before you stop.** Append an entry to `05_AGENT_LOG.md` whenever you finish a
   task, hit a limit, or are about to run out of context. Include: task id, files
   touched, what is done, what is half-done, exact next step. Someone else will pick
   up from your entry.
2. **Tick the roadmap.** When a task in `04_ROADMAP.md` is done, change `[ ]` to `[x]`.
   Use `[~]` for in-progress.
3. **Do not redesign.** The data model and business rules are decided. If you find a
   real contradiction, write it under "Open questions" in the log and choose the
   least invasive option; do not silently change rules.
4. **Do not touch the public website behaviour.** Files under `src/app/(public)`-style
   routes, `src/components/*` (non-admin), bot code and Supabase storage code stay
   as they are. Only add; only edit shared files (`auth.ts`, `AdminNav.tsx`,
   `SubAdminPanel.tsx`, `schema.prisma`, `users/route.ts`) where the roadmap says so.
5. **Match the codebase style.** Roman-Urdu UI messages (e.g. "Case save ho gaya"),
   Tailwind classes like the admin pages, `requirePermission()` guards in every
   API route, `NextResponse.json({ error })` on failure, Prisma via `@/lib/prisma`.
6. **Migrations are hand-written SQL** in `prisma/migrations/<timestamp>_<name>/migration.sql`,
   idempotent (`IF NOT EXISTS`) like the existing ones. Keep `schema.prisma` and the
   SQL in sync. There is no local DB in the dev environment, so verify with
   `npx prisma validate`, `npx prisma generate` and `npm run typecheck`.
7. **Verify before logging "done":** `npm run typecheck` must pass. Run `npm run lint`
   when you touched many files.
8. **Money is `Decimal(12,2)` in Prisma**, never `Float`. Convert with `Number()` only
   at the API boundary for JSON.
9. **Every mutating office API writes an `OfficeAuditLog` row** via
   `logOfficeAction()` in `src/lib/office/audit.ts`.
10. **Small commits, clear messages** (`feat(office): ...`). Commit only if the owner
    asked; otherwise leave the working tree and say so in the log.

## Environment variables added by this module

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=alfarooq-office
R2_PUBLIC_BASE_URL=        # optional, only if bucket has a public/custom domain
```

They are documented in `.env.example`. Without them, file upload in the office module
fails with a clear error; everything else still works.

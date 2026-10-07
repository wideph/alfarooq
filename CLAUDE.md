# Alfarooq Services — agent notes

- Next.js 15 App Router, Prisma + Supabase Postgres, Supabase Storage for website media.
- Admin auth: `Admin` table, JWT cookie `admin_session`, permissions in `src/lib/auth.ts`.
- UI messages are Roman Urdu; keep that style.
- Verify with `npm run typecheck` (no local DB available; migrations are hand-written SQL).

## Office module (cases / payments / commissions)

Before touching anything under `src/app/office`, `src/app/api/office`,
`src/lib/office`, `src/components/office` or the office parts of `schema.prisma`:

1. Read `docs/office-module/00_README.md` (rules), then `01`–`04`.
2. Read the **last entry** of `docs/office-module/05_AGENT_LOG.md` and continue from
   its "Next step".
3. When you stop, append your own entry to the log and tick `04_ROADMAP.md`.

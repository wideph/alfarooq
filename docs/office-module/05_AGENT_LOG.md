# 05 — Agent Log (append-only)

Format for every entry (copy the template, newest entry at the **bottom**):

```
## [YYYY-MM-DD HH:mm] Agent: <name/model> — Task(s): P0.1, P0.2
Done:
- ...
Half-done / caveats:
- ...
Files touched:
- ...
Next step for the next agent:
- exact task id + first concrete action
Open questions (if any):
- ...
```

Rules: never delete earlier entries; never rewrite history; if you undo someone's
work, say so in your own entry.

---

## [2026-09-30 —] Agent: Claude (Fable 5.1) — Task: planning
Done:
- Analysed the existing codebase (auth, permissions, admin UI, Supabase storage, bot AI helper, migrations style).
- Wrote `00_README.md`–`04_ROADMAP.md` and this log. Added root `CLAUDE.md` pointer.
Half-done / caveats:
- No local `.env`/DB in this environment; migrations cannot be executed here, only validated.
Files touched:
- docs/office-module/*, CLAUDE.md
Next step for the next agent:
- Start Phase 0 at P0.1 (this same agent continues below).

## [2026-09-30 —] Agent: Claude (Fable 5.1) — Tasks: P0.1–P0.12, P1.1–P1.4, P2.1, P3.4
Done:
- Phase 0 complete: deps (`@aws-sdk/client-s3`, `s3-request-presigner`), `.env.example` R2 vars, full Prisma schema + migration `20261001120000_office_module`, `prisma validate/generate` OK, `auth.ts` office permissions + `bookingOfficeId` in session/JWT, `lib/office/{permissions,r2,audit,money,serializers,case-numbers,guard,client,labels,case-access,working-day}.ts`, users API supports roles + booking office + member sync, `SubAdminPanel` role/office/preset UI, `AdminNav` "Office" item, login/admin redirects for office roles.
- Phase 1: setup APIs (booking-offices CRUD, members, commissions grid, categories, attestation-types), `OfficeNav`, `OfficePageFrame`, `/office/setup` page (`SetupPanels.tsx`, `WorkingDayPanel.tsx`), `/office` dashboard + `/api/office/dashboard`.
- BR7 working-day engine (`working-day.ts`) + `/api/office/working-day` GET/POST/PUT/DELETE.
- `npm run typecheck` green at this point.
Half-done / caveats:
- P1.5 seed script not written (optional).
- Rule nuance added while coding (documented in 03_BUSINESS_RULES.md BR3.4/BR3.6): when `agreedAmount` is 0 (not yet set) only the half commission is credited; extra-share adjustments use `EXTRA_SHARE` CREDIT/DEBIT rows (not COMMISSION_ADJUST) so the two targets stay separable.
Files touched:
- see git status; all new files under src/lib/office, src/app/office, src/app/api/office, src/components/office.
Next step for the next agent:
- P3.3 `src/lib/office/commission.ts` (`recomputeCaseFinancials`) then P2.2 cases APIs, P3.1/P3.2 payments APIs (this agent continues below).

## [2026-09-30 —] Agent: Claude (Fable 5.1) — Tasks: P2.2–P2.5, P3.1–P3.3, P3.5–P3.6, P4.1–P4.2, P5.1–P5.4, P6.1–P6.2, P7.1–P7.4, P1.5
Done:
- Backend: `lib/office/commission.ts` (`recomputeCaseFinancials`, BR1/BR3 incl. half/final/adjust + extra-share rows), `profit-share.ts` (BR4), `ledger.ts` (balances/liabilities), `case-detail.ts` (detail serializer + `profitStale`), `case-access.ts`.
- APIs: cases (list/create/detail/PATCH/DELETE, contacts, addresses, attestations, status, remaining, commission, expenses, profit), payments (create w/ R2 slip, list, verify PATCH, DELETE, slip signed-URL), ledger (list/balances/payout/delete), salaries, company expenses, finance report (BR6), dashboard, working-day.
- UI: `/office` dashboard, `/office/cases` (filters, attestation chips, printing date), `/office/cases/new`, `/office/cases/[id]` split into `components/office/case/*` (header+alerts+ExtraAmountPopup, info, money/commission/remaining, payments, attestations+print+status, contacts/addresses, expenses+ledger+audit), `/office/payments` cashier queue, `/office/ledger` (accounts, payouts, salaries, company expenses tabs), `/office/finance`, `/office/setup` (offices/members/commission grid, categories, attestation types, working-day overrides).
- `scripts/seed-office-defaults.ts`, `scripts/test-office.ts` (+ `npm run test:office`, `db:seed:office`), README "Office module" section.
- Verification: `npm run typecheck` ✅, `npm run lint` ✅. `next build` compiles all routes ✅ but the static-prerender step fails in THIS environment because `src/app/layout.tsx` calls `getSiteSettings()` (needs a real DATABASE_URL) — pre-existing behaviour, same as before this module; on Vercel/with `.env` it builds.
Half-done / caveats:
- Nothing has been executed against a real database: the migration SQL is hand-written and validated only via `prisma validate`. FIRST thing with a real DB: `npx prisma migrate deploy` (or paste the SQL in Supabase), then `npm run db:seed:office`, then `npm run dev` + `npm run test:office`.
- R2 env vars must be set before slip upload works (clear error otherwise).
- Not committed (owner did not ask). Working tree has all changes; `public/pdf.worker.min.mjs` postinstall change was reverted.
Files touched:
- `git status` shows the full list (src/lib/office, src/app/office, src/app/api/office, src/components/office, scripts, docs, README, package.json, schema + migration, auth/users/AdminNav/SubAdminPanel/login edits).
Next step for the next agent:
- Run against a real DB (see caveats) and fix anything the smoke test surfaces. Then consider: pagination on ledger page, per-role dashboards polish, PDF/print view of a case, WhatsApp share of expected printing date.
Open questions (for the owner):
- Type-1 offices: when agreedAmount is still 0, only the half commission is credited until the fee is set (documented BR3.4). Confirm this is desired.
- Should booking-office logins see their office's ledger balance (currently yes, read-only)?

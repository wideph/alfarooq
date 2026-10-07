# 04 — Roadmap

Legend: `[ ]` todo · `[~]` in progress · `[x]` done. Work strictly top-to-bottom
inside a phase; phases can overlap only where noted. Update the checkbox and write
to `05_AGENT_LOG.md` when you finish or stop.

## Phase 0 — Foundation (schema, auth, storage)

- [x] P0.1 Add deps: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (`package.json`).
- [x] P0.2 `.env.example`: add R2 variables (see `00_README.md`).
- [x] P0.3 `prisma/schema.prisma`: add all models from `02_ARCHITECTURE.md` §5 + `Admin.bookingOfficeId` + `CaseCounter`.
- [x] P0.4 `prisma/migrations/20261001120000_office_module/migration.sql` (idempotent SQL, FKs in DO block).
- [x] P0.5 `npx prisma validate && npx prisma generate` pass.
- [x] P0.6 `src/lib/auth.ts`: add office permissions to `ADMIN_PERMISSIONS`; add `bookingOfficeId` to `AdminSession`; `getFreshAdminSession` selects it; `login/route.ts` puts it in JWT.
- [x] P0.7 `src/lib/office/permissions.ts`: `OFFICE_ROLES`, `ROLE_PRESETS`, `isOfficeRole()`, `OFFICE_PERMISSION_GROUPS` (for UI).
- [x] P0.8 `src/lib/office/r2.ts` (upload/delete/signed url) + `src/lib/office/audit.ts` + `money.ts` + `serializers.ts` + `case-numbers.ts`.
- [x] P0.9 `src/app/api/admin/users/route.ts`: accept `role` (admin-only can set office roles) + `bookingOfficeId`; validate booking_office needs an office; auto-create/link `BookingOfficeMember` for booking_office users.
- [x] P0.10 `SubAdminPanel.tsx`: role dropdown, booking office dropdown, office permission checkboxes grouped; preset button fills permissions.
- [x] P0.11 `AdminNav.tsx`: add "Office" item (visible if any office permission) + type union updated. Login redirect: office roles → `/office`.
- [x] P0.12 `npm run typecheck` green.

## Phase 1 — Setup (super admin configuration)

- [x] P1.1 API `setup/booking-offices` CRUD (+ members, + commissions per category).
- [x] P1.2 API `setup/categories` CRUD, `setup/attestation-types` CRUD.
- [x] P1.3 `OfficePageFrame.tsx` + `OfficeNav.tsx` (role-aware items, reuse admin styling).
- [x] P1.4 `/office/setup` page with panels: Booking Offices (type, members with %, commissions grid), Categories, Attestation Types, Working-day overrides.
- [x] P1.5 Seed helper `scripts/seed-office-defaults.ts` (a few categories + attestation types) — optional, idempotent.

## Phase 2 — Cases (booking office)

- [x] P2.1 `case-access.ts` scoping helper.
- [x] P2.2 API cases list/create/detail/update; contacts; addresses; attestations add/remove.
- [x] P2.3 `/office/cases` list with filters (status, office, search by name/roll/reg/case no.), expected printing date column.
- [x] P2.4 `/office/cases/[id]` detail page skeleton: header, info, contacts/addresses editors, required attestations editor.
- [x] P2.5 `/office/cases/new` (or modal) create form with category, roll/reg, agreed amount, attestations, first contact/address.

## Phase 3 — Payments (booking office submit, cashier verify)

- [x] P3.1 API payments create with slip upload to R2; list queue; slip signed URL route.
- [x] P3.2 API payment verify (status/date/amount) → calls `recomputeCaseFinancials` + working-day update; returns `needsExtraDecision`.
- [x] P3.3 `commission.ts`: `recomputeCaseFinancials()` per BR3.5/3.6; `remaining` API (BR2).
- [x] P3.4 `working-day.ts` per BR7 (AI + cache + fallback) + `working-day` API.
- [x] P3.5 UI: payment form on case page (booking office), slip viewer, cashier queue `/office/payments`, verify buttons, date/amount edit, remaining accept/edit, **ExtraAmountPopup**.
- [x] P3.6 Commission reduce UI (cashier/super admin) with reason.

## Phase 4 — Attestation office

- [x] P4.1 API `cases/[id]/status` + attestation status/date PATCH with forward-only auto transitions.
- [x] P4.2 UI: attestation dashboard view on `/office/cases` (columns: printed?, each attestation status/date), inline status changes on detail page.

## Phase 5 — Ledger, payouts, profit share, salaries, expenses

- [x] P5.1 API ledger list (office/member filters, balances) + payout POST.
- [x] P5.2 `profit-share.ts` finalize/re-finalize + API.
- [x] P5.3 API case expenses, company expenses, salaries.
- [x] P5.4 UI `/office/ledger`: office selector, balance cards, entries table, payout form; profit finalize button on case page (type 2); expenses editors; salaries panel.

## Phase 6 — Finance (super admin)

- [x] P6.1 API `finance` per BR6 (range presets, per-day series, per-office breakdown, liabilities).
- [x] P6.2 UI `/office/finance` with preset buttons, custom range, summary cards, table.

## Phase 7 — Hardening

- [x] P7.1 Audit log viewer on case detail (super admin).
- [x] P7.2 `scripts/test-office.ts` smoke test (login as each role, create case, submit/verify payment, check ledger, finance).
- [x] P7.3 README section "Office module" + R2 bucket setup steps.
- [x] P7.4 `npm run verify` green; final log entry.

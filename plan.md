# Wave 11 — Status flow overhaul + notifications + speed (FINAL polish)

Skill: vibecoding-general-swarm (Mode A — multi-agent). Repo: /mnt/agents/alfarooq (edit here, NEVER npm install here — fuse FS). Verify in /tmp per-agent copies. Push from /tmp/push5.

## User demands (Roman Urdu brief, 2026-10-09)
1. New EXACT case status flow (see SPEC §W11.1) — clear, one-glance, admin dropdown in cases LIST itself.
2. Detail page: remove/simplify bulky status bar; everything clear at a glance.
3. Cases list row = whole box clickable (except expense + status controls).
4. Partner office: first payment → amount distributable immediately; members' % auto-credit, remainder = admin share.
5. Commission office: 50% to case user on first payment, 50% on full payment — attributed to the case's user (memberId).
6. KILL all unnecessary delay on every admin page + case detail open.
7. Live updates without manual refresh (polling infra — websockets not viable on serverless).
8. Navbar badge counts (attention-needed per section) + full notification system.
9. Booking office must NOT see filing-dept files unless admin grants per-case permission; all other case files visible.
10. Booking office navbar: remove confusing "Links" dropdown (keep admin-only).

## Stage 0 — Orchestrator (me)
- plan.md + SPEC append (docs/office-module/06_NEW_REQUIREMENTS.md §W11)
- Schema: Case.currentAttestationId, Case.filingFilesVisibleToBooking, Notification model, status default FIRST_PAYMENT_PENDING
- Migration SQL prisma/migrations/20261009120000_office_wave11/migration.sql + apply live via pooler

## Stage 1 — Parallel backend agents (strict file ownership)
- **Agent A (status-engine)**: permissions.ts status consts, labels.ts, workflow.ts transitions + dept queues, status route rewrite (attestation-pointer jumps, side effects, note mandatory), files route (auto transitions + booking visibility filter), attestations routes (currentAttestation sync), complete-all route, cases list route (payload for dropdown), [id]/route.ts (filingFilesVisibleToBooking PATCH), case-detail.ts SPEED (Promise.all, audit→lazy /audit endpoint), payments/[id]/route.ts (new transitions + auto-distribute hook call), audit endpoint new.
- **Agent B (finance)**: commission.ts + profit-share.ts — auto partner distribution on every RECEIVED payment (idempotent), admin remainder in summary, commission ledger entries get memberId = case creator's member. Exposes `autoDistributeOnPaymentReceived(caseId, session)` per contract (Agent A calls it).
- **Agent C (notify+live)**: lib/office/notifications.ts (notifyUsers/notifyAdmins/notifyRole), /api/office/notifications routes, /api/office/nav-counts (single aggregated badge endpoint), hooks/useLiveRefresh.ts, lib/office/client.ts (officeFetch dispatches office:changed), remarks route notification firing. Contract: notify* helpers used by A/B.

## Stage 2 — Agent D (UI overhaul) after Stage 1 merge
Cases list (inline status dropdown + note modal, clickable rows, prefetch, live refresh), case detail redesign (slim status header replacing bulky stepper, filing-visibility toggle, lazy history tab, live refresh), OfficeNav + AdminNav (badges + bell + booking links removal), mobile pass.

## Stage 3 — Integration (me)
/tmp/push5: overlay → npm install → typecheck → lint → build (real DATABASE_URL) → fix → commit → push → ls-remote verify → final Roman Urdu summary.

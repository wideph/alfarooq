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

## [2026-10-08 —] Agent: Claude (Fable 5.1) — Wave 2026-10: N1, N2, N3 (docs 06)
Done:
- N3: `FloatingHomeButton` + `BotChatWidget` ("Sawal poochein" trigger aur chat bubble)
  ab `/office/*` par bhi render nahi hote (`/admin` guard pehle se tha). Public site par
  dono waise hi kaam karte hain. `SubmitQuestionModal` sirf confirmation modal hai
  (floating trigger nahi), isliye touch nahi kiya.
- N1: `AdminNav` se single generic "Office" entry hata di; office destinations
  (Dashboard /office, Cases, Payments, Ledger, Finance, Setup) ab DIRECT top-level nav
  items hain — same look, `adminCanAny` permission-filtered (OfficeNav jaisa), super
  admin ko sab. Icons + `hidden md:inline` labels, overflow-x-auto intact.
- N2 API: `POST /api/office/setup/booking-offices` ab `users: [{name,email,password,role}]`
  accept karta hai — poora office + default member + saare users + audit rows ek
  `prisma.$transaction` mein. Validation: email unique (DB + list ke andar duplicate),
  password min 6, role ∈ OFFICE_ROLES (tamam 7 roles). Naya route
  `POST /api/office/setup/booking-offices/[id]/users` mojooda office mein baad mein user
  add karne ke liye. Shared logic naye `src/lib/office/office-users.ts` mein
  (`validateOfficeUser` + `createOfficeUser`: bcrypt hash, ROLE_PRESETS permissions,
  bookingOfficeId, booking_office role par BookingOfficeMember auto-link — /api/admin/users
  ka mirror). GET booking-offices ab `users` (id/name/email/role/isActive) bhi include karta hai.
- N2 UI: `SetupPanels.tsx` Booking Offices panel redesign — create card mein "Users / Roles"
  sub-section (inline rows: naam, email, password show/hide eye toggle, role dropdown
  ROLE_LABELS ke sath, remove row; khaali rows submit par filter). Selected office ke neeche
  naya `OfficeUsersEditor` (mojooda logins list + inline add row). Members (profit %) aur
  commission grid waise ke waise. `/office/setup` page par heading add ki.
- Verification: `npm run typecheck` ✅ green (tsc --noEmit, 0 errors) — lekin NOTE:
  shared repo ka node_modules is environment mein bar bar wipe/install ho raha tha
  (doosre wave-2 installer + FUSE portal FS jahan symlinks/chmod kaam nahi karte), isliye
  typecheck ek fresh copy `/tmp/tc` mein chalaya gaya (source usi waqt repo se sync,
  `npm install` wahan clean, `prisma generate` OK). Repo mein node_modules/.bin ke
  wrapper scripts (tsc, prisma — plain sh jo node invoke karte hain) maine chhore hain
  kyunke is FS par npm .bin symlinks bana nahi sakta.
Half-done / caveats:
- Typecheck repo ke andar `npm run typecheck` se verify nahi ho saka (node_modules churn);
  /tmp/tc copy par green hai. Agla agent jab repo node_modules stable ho to ek dafa
  `npm run typecheck` repo mein dohra le.
- Kuch bhi commit nahi kiya (owner ne nahi kaha); saari changes working tree mein hain.
Files touched:
- src/components/FloatingHomeButton.tsx, src/components/BotChatWidget.tsx,
  src/components/admin/AdminNav.tsx, src/components/office/SetupPanels.tsx,
  src/app/office/setup/page.tsx, src/app/api/office/setup/booking-offices/route.ts,
  src/app/api/office/setup/booking-offices/[id]/users/route.ts (NEW),
  src/lib/office/office-users.ts (NEW), docs/office-module/05_AGENT_LOG.md (append).
Next step for the next agent:
- Repo node_modules stable hone par repo mein `npm run typecheck` re-run karein; phir
  real DB ke sath N2 flow (office + users create, baad mein user add) smoke test karein.


## [2026-10-08 —] Agent: Claude (subagent, date-engine mission) — Wave 2026-10: N5 + N6 engine & APIs (docs 06)
Done:
- `src/lib/office/date-engine.ts` (NEW): deterministic working-day engine over the
  HolidayClosure table (scopes PAKISTAN/ISLAMABAD/QUETTA/GUJRAT/LAHORE/EMBASSIES_ISB/SAUDI),
  weekends PK Sat+Sun / Saudi Fri+Sat. Exports `isPakistanWorkingDay(date, city?)`,
  `isSaudiWorkingDay`, `firstWorkingDayOnOrAfter`, `firstWorkingDayAfterOffset`,
  `specialMoofaCityDate` (Islamabad → Gujrat → Lahore priority, city stored),
  `saudMbcDate` (+2, ISB working day on Tue/Wed/Thu/Fri, no EMBASSIES_ISB closure),
  `moofaSaudDate` (+4, Saudi working day Sun–Wed), `formatDdMmYy`, and the
  orchestrator `generateSetDates(caseId)`.
- `generateSetDates`: computes every set step per §N5 (r-number mode for
  UV_IDCC/BACK_NEVTCC 2nd-step sets + M Tech (i)/(iii): suffix 19/20/21 → year
  2020/2021/2022 via payment month/day in that year, else random pick from
  WorkingDatePool year=2019 excluding Sat/Sun; UV/Back-Nevtcc paired ≥3 days later,
  pair noted on both steps. QR/CURRENT_NEVTCC family + Bord-only (v)/(vii): Bord =
  payment+5 (PAK+QUETTA rule), QR = Bord+2 (ISB). Special Moofa: i-style payment+7,
  ii-style prev+1, Medical MOH_ATTA+1, CPLS/APAC nevtcc+1. Medical/CPLS/APAC
  formulas per §N5). Upserts AttestationType by label + CaseAttestation
  (caseId+typeId); sets Board Attas Number once per case (never re-consumes the
  counter). Missing first RECEIVED payment / empty 2019 pool → steps stay pending,
  `pending` status + Roman-Urdu reasons returned, never throws.
- Deviation (documented in code): regeneration keeps an existing step's status
  (IN_PROGRESS/DONE) and keeps the old date when the new computation is pending —
  brief said "status PENDING" but wiping atta-department progress on regenerate
  would break N7. Confirm with owner.
- `src/lib/office/hijri.ts` (NEW): tabular (civil) Hijri conversion, comment notes
  ±1 day approximation. `src/lib/office/board-attas.ts` (NEW): atomic
  BoardAttasCounter increment (upsert+increment in tx), format
  `[year last digit][MM][count pad-3, grows past 999]`, leading `0`→`8`.
  `src/lib/office/rnumber.ts` (NEW): `parseRollSuffix`, `boardYearForSuffix`
  (19→2020, 20→2021, 21→2022, else null = 2019 pool), dim rule for categories
  "Dip BBTE DAE 3Y"/"BBTE DBA 3Y" suffix 22..29 → set names containing "(i)"
  dimmed, reason "Ye set is r-number ke liye available nahi".
- APIs (all guardOffice + logOfficeAction, `NextResponse.json({error})` on failure):
  `GET /api/office/setup/sets` (?categoryId, ?rollNumber → per-set dimmed info,
  office:cases:read); `POST|DELETE /api/office/cases/[id]/set` (office:cases:write +
  findAccessibleCase, rejects dimmed with 403 Roman-Urdu, auto-generates dates if a
  RECEIVED payment exists); `POST /api/office/cases/[id]/generate-dates`
  (office:attestation:write, admin bypasses); `GET|POST|PATCH|DELETE
  /api/office/setup/holidays` (office:setup:write, filters year/scope);
  `GET|POST|DELETE /api/office/setup/date-pool` (office:setup:write, POST validates
  the date is a PK working day, 30-per-year cap, `?suggest=1` returns next
  candidate working dates not yet pooled).
- Payment verify hook (`payments/[id]/route.ts` PATCH): when a payment newly turns
  RECEIVED and it is the case's first RECEIVED payment → status NEW/PAYMENT_PENDING
  becomes WAITING_FOR_FILE, and if Case.setId is set `generateSetDates` runs
  (awaited, errors logged not thrown). Extra-amount/commission logic untouched.
Half-done / caveats:
- Repo node_modules on the fuse FS repeatedly broke (concurrent installs); per lead
  coordination, verification was done in a full copy at /tmp/w2:
  `npx prisma validate` ✅, `npx prisma generate` ✅, `npm run typecheck` ✅ (zero
  errors, against the latest repo state incl. other agents' files). If repo
  node_modules is repaired later, re-run `npm run typecheck` there once.
- Nothing executed against a real DB (same as previous entries).
- UI for set selection / holidays / date-pool panels not in scope (comes later).
Files touched:
- src/lib/office/{date-engine,hijri,board-attas,rnumber}.ts (NEW),
  src/app/api/office/setup/sets/route.ts (NEW),
  src/app/api/office/cases/[id]/set/route.ts (NEW),
  src/app/api/office/cases/[id]/generate-dates/route.ts (NEW),
  src/app/api/office/setup/holidays/route.ts (NEW),
  src/app/api/office/setup/date-pool/route.ts (NEW),
  src/app/api/office/payments/[id]/route.ts (hook added),
  docs/office-module/05_AGENT_LOG.md (this entry).
Next step for the next agent:
- N7/N10 UI: case set-selection dropdown consuming GET /api/office/setup/sets
  (?categoryId&rollNumber, honour `dimmed`), holidays + date-pool admin panels,
  atta-department step UI over CaseAttestation scheduledDate/notes.
Open questions (for the owner):
- Suffix 19/20/21: brief fixes only the Bord/UV YEAR (2020/2021/2022); engine uses
  the first payment's month/day inside that year → first working day. Confirm.
- Regenerate keeps DONE/IN_PROGRESS step status (see Deviation above). Confirm.


---

## Entry — N6 admin UI: Holidays panel + 2019 Working Dates Pool panel (setup page)

Task: N6 follow-up — admin panels for `HolidayClosure` and `WorkingDatePool` on
`/office/setup` (permission `office:setup:write`, same visibility pattern as the
other setup panels via `OfficePageFrame`).

Done:
- NEW `src/components/office/HolidayPanel.tsx` — HolidayClosure CRUD. Lists all
  holidays grouped by year (desc), date asc inside each year; columns: date
  (dd-mmm-yyyy via shared `formatDate`), coloured scope badge
  (PAKISTAN / ISLAMABAD / QUETTA / GUJRAT / LAHORE / EMBASSIES_ISB / SAUDI),
  reason, Edit + Delete per row. Add/edit form (date picker, scope dropdown,
  reason text) — POST for add, PATCH for edit (upsert note shown: same
  date+scope updates reason). Roman-Urdu messages ("Chhuti add ho gayi",
  "Chhuti update ho gayi", "Delete ho gaya") + the required note about
  non-working dates and approximate Eid dates. Scope list is mirrored locally
  (date-engine.ts is server-only — must not be imported into a client bundle).
- NEW `src/components/office/DatePoolPanel.tsx` — WorkingDatePool panel. Year
  selector (2019–2030, default 2019), X/30 count badge, list of pooled dates
  with delete, manual date add (POST), "Suggest dates" button
  (GET ?year=Y&suggest=1) rendering candidate chips with one-click add
  (POST per date) plus a "Sab add karein" loop button that stops on the first
  API error and shows it as-is. Required note about random Bord-date picks
  when r-number last digits are not 19–29.
- `src/components/office/SetupPanels.tsx` — only re-exports the two new
  default-export panels (`HolidayPanel`, `DatePoolPanel`) so page imports stay
  in one place; no existing panel touched.
- `src/app/office/setup/page.tsx` — renders both panels in a 2-col grid under
  `WorkingDayPanel`, sharing the existing `onMessage` toast.
Style: matches existing panels exactly (rounded-2xl border cards, slate
palette, primary-600 buttons, same input/btn class strings, mobile-friendly
grids + overflow-x-auto tables).

Verification (per ENV RULE — nothing installed in the repo): full copy at
/tmp/w4c (repo sans node_modules; node_modules seeded from the repo copy since
/tmp/tc did not exist), `npm install --no-audit --no-fund` (reconcile) ✅,
`npx prisma generate` ✅, `npm run typecheck` ✅ (zero errors, against latest
repo state incl. other agents' files). No DB access available (as before).
No commit made — working tree left as-is.

Files touched:
- src/components/office/HolidayPanel.tsx (NEW),
  src/components/office/DatePoolPanel.tsx (NEW),
  src/components/office/SetupPanels.tsx (re-export lines only),
  src/app/office/setup/page.tsx (render the 2 panels),
  docs/office-module/05_AGENT_LOG.md (this entry).

Next step for the next agent:
- N7/N10 UI remaining: case set-selection dropdown (GET /api/office/setup/sets),
  atta-department step UI over CaseAttestation scheduledDate/notes.

## Entry — Wave 5: §N8/N9 finance rules + department links (backend, subagent)

- `src/app/api/office/office-expenses/route.ts` (NEW): `GET ?bookingOfficeId=&from=&to=`
  (office:ledger:read; booking_office login scoped to own office) lists OfficeExpense
  with office + member names. `POST {bookingOfficeId, memberId?, amount, description,
  expenseDate}` (office:expenses:write; admin bypasses) in ONE transaction creates the
  OfficeExpense row + ledger write per §N8: FIXED_COMMISSION → EXPENSE DEBIT on office
  ledger (memberId when given — "minus from that user's commission"; company profit
  impact zero, only payout liability shrinks); PROFIT_SHARE → same EXPENSE DEBIT plus
  pool deduction in finalize (below); SALARY → NO ledger debit, company cost in finance
  only. `DELETE ?id=` admin-only; ledger rows are never deleted (BR1.5) so the EXPENSE
  debit is neutralised with a reversing EXPENSE CREDIT on the same entryDate, all in
  one transaction + audit.
- `src/lib/office/profit-share.ts`: §N8 — pool = received − case expenses − office
  expenses (OfficeExpense of the office, floored at 0), then split by profitPercent.
  `ProfitShareSummary` gains `officeExpenses`. Re-finalize stays idempotent (only
  PROFIT_SHARE/ADJUSTMENT rows compared).
- `src/app/api/office/finance/route.ts`: presets `daily`/`weekly` added as aliases of
  today/week. Fetches OfficeExpense rows in range: per-office breakdown field
  `offices[].officeExpenses` (all types, informational); summary gains
  `officeExpenses` (SALARY-office rows = company cost, subtracted from profit) and
  `officeExpensesTotal` (all rows, NOT subtracted); day rows gain `officeExpenses`.
  No double count: commission-office expenses sit in EXPENSE ledger debits (not in
  SHARE_TYPES) and profit-share expenses are already netted in the share credits, so
  neither is subtracted again. Response shape only extended, nothing renamed.
- `src/app/api/office/ledger/route.ts` + `src/lib/office/ledger.ts`: new
  `memberBalance(memberId, officeId?)` helper; `GET ?memberId=` response gains
  `memberBalance` (all-time CREDIT−DEBIT, office-scoped when known). memberId filter
  + memberBalances already existed. EXPENSE entries from office-expenses POST appear
  in member/office ledgers automatically.
- `src/app/api/office/setup/department-links/route.ts` (NEW): `GET` any authenticated
  office user (active links; `?all=1` + office:setup:write shows inactive too),
  `POST`/`PATCH`/`DELETE` office:setup:write with logOfficeAction; URL must start
  http(s)://.
- `src/lib/office/labels.ts`: LEDGER_TYPE_LABELS gains `EXPENSE: "Office expense"`.
- booking-offices route NOT touched: GET already includes `users` (Wave-3 work).
Known accounting note (per spec, flagged): for PROFIT_SHARE offices the expense is
reflected twice at the office-AGGREGATE balance (reduced share credits + EXPENSE
debit); per-member balances are correct (memberBalances ignores null-member rows).
This matches the Wave-5 spec literally; revisit with owner if aggregate display
should net it out.
Verify: full-repo copy at /tmp/w5 (repo node_modules was broken — 29 entries, so
fresh `npm install --no-audit --no-fund` there), `npx prisma validate` OK,
`npx prisma generate` OK, `npm run typecheck` zero errors. Not committed.

## Entry — Wave 4: §N7 department workflow + case model changes (backend, subagent)
Done:
- `src/lib/office/workflow.ts` (NEW): department constants + permission map
  (FILING→office:filing:write etc.), remark-target role mapping + allowed
  targets (booking→ADMIN/ATTA/PRINTING, filing→ADMIN/BOOKING/PRINTING,
  printing/atta/courier/admin→any), `deptQueueWhere` (?dept=filing|printing|
  atta|courier, filing `history=1`), `setMissingWarning` (status PRINTED+ &
  setId null), `unseenWarningCaseIds`, `serializeFilingCase` (stripped payload:
  id/caseNumber/category name/r-number/reg-number/notes/status/setName/client
  picture signed URL only), `evaluateCaseCompletion` (all set-step
  CaseAttestations DONE — fallback: ALL CaseAttestations DONE when no set — AND
  an ATTA file with stepKey=FINAL ⇒ status COMPLETED; forward-only),
  `activateWorkflowOnFirstPayment` (first RECEIVED payment ⇒ WAITING_FOR_FILE +
  generateSetDates when set selected; accepts IN_PROCESS because it runs after
  recomputeCaseFinancials — fixes Wave-2 hook that never fired), `parseCaseInput`
  (JSON or multipart w/ clientPicture file).
- `src/lib/office/r2.ts`: `uploadDepartmentFile` (pdf/image ≤10MB, video
  ≤100MB) for department files; payment-slip upload untouched.
- `src/lib/office/case-access.ts` (§N9): booking_office scoped to own office
  UNLESS `office:cases:read-all`; company-side roles see all.
- `src/lib/office/case-detail.ts`: list+detail include `set`; detail returns
  setName/setMissingWarning/hasUnseenWarning/clientPictureUrl; filing role gets
  `serializeFilingCase` (no money fields at all). `serializeCaseRow` gains
  setName/setMissingWarning/hasUnseenWarning.
- `cases/route.ts`: GET `?dept=` queues + urgent-first ordering + warnings;
  POST clientName OPTIONAL (""), r-number OR reg-number required (400
  "r-number ya reg-number lazmi hai"), agreedAmountRemarks/courierNumber/
  isUrgent/clientPicture (multipart→R2).
- `cases/[id]/route.ts` PATCH: same fields + clientPicture replace (old R2
  object deleted), combined roll/reg check against existing values.
- `cases/[id]/files/route.ts` (NEW): GET signed-URL list; POST multipart
  (file+department+stepKey?+title?) with per-department permission and status
  side-effects in one tx (first FILING→WAITING_FOR_PRINTING; first
  PRINTING→PRINTED+isPrinted+printedAt; ATTA→evaluateCaseCompletion;
  COURIER→DELIVERED); DELETE ?id= uploader's department or admin.
- `cases/[id]/attestations/route.ts` PATCH: office:atta:write can move steps
  forward-only PENDING→IN_PROGRESS→DONE (+completedDate), status/notes/date
  edits stay with office:attestation:write; COMPLETED now requires FINAL atta
  file (evaluateCaseCompletion), ATTESTATION auto-move kept.
- `cases/[id]/remarks/route.ts` (NEW): POST {text,targets[]} role-limited;
  GET visibility = admin-all / targeted-at-my-department / created-by-me, with
  recipient ids+seenAt+hasUnseenWarning; PATCH {recipientId} marks seen.
- `cases/[id]/discount-requests/route.ts` (NEW): POST {amount,reason} (one
  PENDING per case, ≤ agreedAmount), GET list.
- `api/office/discount-requests/route.ts` (NEW): GET admin/cashier (optional
  ?status=); PATCH {id,action,deductFrom,partialCommissionAmount?} — ACCEPT in
  tx: mark ACCEPTED, decrement Case.agreedAmount (recompute keeps remaining
  consistent), DISCOUNT DEBIT LedgerEntry for the commission part (PROFIT part
  absorbed by company, audit-only), then recomputeCaseFinancials.
- `api/office/bonus-requests/route.ts` (NEW): GET (admin/cashier all, booking
  office own), POST {bookingOfficeId?,caseId?,amount,reason}, PATCH accept ⇒
  BONUS CREDIT LedgerEntry to office (deductFrom COMMISSION|PROFIT recorded).
- `payments/route.ts` POST + `payments/[id]/route.ts` PATCH: both call
  `activateWorkflowOnFirstPayment` (direct-RECEIVED creates were missing the
  hook; verify-hook bug fixed, see above).
- `permissions.ts`: booking_office + courier presets gain office:remarks:write
  (N7 requires them to send targeted remarks).
- schema.prisma: LedgerEntry type comment extended with DISCOUNT | BONUS
  (comment only, no migration needed — types are plain strings).
Status transition table (auto): first RECEIVED payment ⇒ WAITING_FOR_FILE ⇒
first FILING file ⇒ WAITING_FOR_PRINTING ⇒ first PRINTING file ⇒ PRINTED ⇒
atta step IN_PROGRESS ⇒ ATTESTATION ⇒ all set steps DONE + FINAL ATTA file ⇒
COMPLETED ⇒ COURIER file ⇒ DELIVERED. CANCELLED stays admin-only.
Half-done / caveats:
- Courier queue "payment clear" simplified per brief: status COMPLETED +
  courierNumber + ≥1 address (no received-vs-agreed check).
- CaseRemarkRecipient.seenAt is per TARGET (schema), so one department user
  marking seen clears the warning for colleagues of the same department.
- Case clientName column stays required String — empty name stored as "".
- No pages/components (backend-only mission). N7 UI still open.
Verify: full-repo copy at /tmp/w4 (repo node_modules broken on fuse FS; fresh
`npm install --no-audit --no-fund` there per ENV RULE), `npx prisma generate`
OK, `npm run typecheck` zero errors (repo state incl. Wave-5 files at sync
time). NOT committed, per instructions.
Next step for the next agent:
- N7/N8 UI: department queues (?dept=), file upload/view per department,
  targeted remarks UI + warning badges (setMissingWarning/hasUnseenWarning/
  isUrgent), discount/bonus request + decision popups.

## Entry — Wave 5 UI: §N9 department links panel + login/nav surfaces (subagent)

Mission: UI for department access links (backend route
`api/office/setup/department-links` already existed from Wave 5 backend).
Files touched (owned scope only, NOT committed):
- `src/components/office/DepartmentLinksPanel.tsx` (NEW): CRUD admin panel
  (office:setup:write, loads `?all=1`). Department dropdown
  (BOOKING_OFFICE/CASHIER/FILING/PRINTING/ATTA/COURIER/OTHER), label, url,
  order, isActive toggle (inline PATCH), edit/delete rows. Includes the
  required note: "In links ka DNS Vercel men manually add karna ho ga — yahan
  siraf link record hota hai." Style copied from HolidayPanel.
- `src/app/office/setup/page.tsx`: renders <DepartmentLinksPanel> at the
  bottom, imported directly from the new file (SetupPanels.tsx untouched).
- `src/app/admin/login/page.tsx`: below the login card, tries
  GET /api/office/setup/department-links. NOTE: the GET route requires an
  office session (guardOffice office:cases:read → 401 logged-out), so for
  logged-out visitors the fetch fails and the static hint "Department links
  admin se hasil karein" is shown instead (per mission brief — API auth NOT
  weakened). If the fetch ever succeeds (e.g. session still alive), active
  links render as small chips (label → url, target _blank).
- `src/components/office/OfficeNav.tsx`: new "Links" dropdown in the center
  nav (any office user), fetches active links, label + ExternalLink icon,
  opens new tab; backdrop click closes menu. Existing nav items untouched.
Verify: fresh copy at /tmp/w4d (repo node_modules is stub-only; fresh
`npm install --no-audit --no-fund` in /tmp/w4d per ENV RULE — nothing
installed in the repo), `npx prisma generate` OK, `npm run typecheck`
zero errors. NOT committed, per instructions.
Next step: none for N9 UI. Open from previous entries: N7/N8 department
queues/remarks UI.

## Entry — Wave 6 UI: §N7/N8 department workflow UI — cases create/list/detail (subagent)

Mission: full department-workflow UI over the Wave-4 backend APIs (owned
scope only: `src/app/office/cases/**` + `src/components/office/case/**`,
plus two additive shared-lib edits; NOT committed).

Done:
- Case CREATE (`cases/new/page.tsx`): client name ab optional; r-number +
  reg-number fields with note "R-number ya reg-number — in men se aik lazmi
  hai" + client-side validation (submit disabled/error); remarks textarea;
  agreed amount remarks; client picture (image) file input; submit hamesha
  multipart FormData (parseCaseInput ke mutabiq, arrays JSON strings);
  success par detail page redirect.
- Cases LIST (`cases/page.tsx`): department queue tabs (?dept=filing|
  printing|atta|courier) — tab sirf matching office:<dept>:write permission
  par, admin/cashier ko sab; filing tab par "History" toggle (?history=1);
  "All cases" tab. Row badges: URGENT (red, isUrgent), red "Set missing"
  badge (title "Is case ka set select nahi kiya gaya"), amber dot
  (title "Aap ke department ke liye new remarks"). Admin/cashier ko per-row
  "Expense" quick action → `/office/cases/[id]#expenses`. Filing-stripped
  list payload (no bookingOffice/totals/attestations/isPrinted) ke liye
  saare cells optional-safe. Existing filters (q/status/officeId/paging)
  unchanged.
- NEW `case/CaseFileViewer.tsx`: in-app modal viewer for R2 signed URLs —
  image (zoom), pdf (pdfjs, getDocument({url}) + fetch/Uint8Array fallback),
  video (<video controls>). ImageViewer/PdfViewer jaise hi style (signed URL
  se, /api/media ke bajaye — shared components touch nahi kiye).
- NEW `case/CaseFilesCard.tsx`: per-department sections. FILING: upload
  1–2 pdf/image + list. PRINTING: filing files ki alag list (dekhne/download
  ke liye) + printed proof upload (image/pdf/video). ATTA: per-set-step
  optional upload (stepKey dropdown selected set ke steps se) + alag
  highlighted "Final file (lazmi)" uploader (stepKey=FINAL). COURIER:
  printing+atta files "Dekhein" se in-app viewer mein + courier slip upload.
  Upload sirf us dept ki write permission par (admin sab); lists sab ke liye
  read-only; delete own-dept/admin. Upload ke baad detail reload (status
  workflow aage barhta hai).
- NEW `case/CaseSetCard.tsx`: GET setup/sets?categoryId&rollNumber se sets;
  dimmed sets opacity-50 + cursor-not-allowed + reason tooltip/text (select
  bhi disabled); select = POST cases/[id]/set; selected set ke steps with
  scheduledDate/status/notes (detail.attestations se label match) + Bord
  step par Board Attas # chip; "Dates generate karein" button
  (office:attestation:write / office:atta:write / cashier — API khud guard
  karta hai) → POST generate-dates, pendingReasons amber box mein.
- NEW `case/CaseRemarksCard.tsx`: visible remarks list (creator name+role,
  time, target chips with seen ✓); amber "Aap ke department ke liye new
  remarks" banner + "Mark seen" (tamam forMe unseen recipients PATCH);
  create form target checkboxes role-limited (booking→ADMIN/ATTA/PRINTING,
  filing→ADMIN/BOOKING/PRINTING, printing/atta/courier/admin→sab), sirf
  office:remarks:write par.
- NEW `case/CaseDiscountCard.tsx`: booking (office:cases:write) request form
  {amount, reason} → POST cases/[id]/discount-requests; admin/cashier
  (payments:verify) pending par Decide popup: radio COMMISSION/PROFIT/
  PARTIAL (+ partial commission amount input) → PATCH
  /api/office/discount-requests; Reject button; poori history status chips
  ke sath; accept par detail reload (agreed amount ghatti hai).
- NEW `case/CaseBonusCard.tsx`: booking office form {amount, reason} (caseId
  auto-linked) → POST /api/office/bonus-requests; admin/cashier is case ki
  requests (GET se caseId filter) Decide popup COMMISSION/PROFIT → PATCH;
  history chips.
- NEW `case/FilingCaseView.tsx`: filing role ke liye detail page ka limited
  render (API payload bhi stripped hai) — sirf category, r/reg, remarks
  (notes), client picture (viewer), status, set name, FILING files card,
  remarks card. Koi money/payment card nahi. cases/[id] page role===filing
  par ye render karta hai.
- CaseHeader: URGENT badge + "Urgent karein/hatayein" toggle
  (office:cases:write, PATCH isUrgent); red banner jab setMissingWarning;
  Board Attas # chip; set name header line mein.
- CaseInfoCard: courierNumber row + edit; clientName optional (r/reg lazmi
  validation); client picture thumbnail (click → viewer) + edit mode mein
  picture replace (multipart PATCH); Set row.
- CaseMoneyCard: agreed amount ke sath remarks view/edit
  (PATCH agreedAmountRemarks, office:cases:write).
- CaseAttestations: atta role (office:atta:write, bina attestation:write)
  per-step "Shuru karein"/"Done karein" forward-only buttons; Bord step par
  Board Attas # chip; scheduledDate + notes pehle se show.
- CaseExpensesLedger: expenses card ko `id="expenses"` anchor (list ke
  Expense quick action ke liye).
- Shared additive edits (owned scope se bahar, sirf additive):
  `src/lib/office/types.ts` — CaseDetail gains setId/set/setName/
  setMissingWarning/hasUnseenWarning/isUrgent/courierNumber/
  agreedAmountRemarks/boardAttasNumber/clientPictureUrl/clientPictureType +
  new types FilingCaseDetail/CaseFileItem/CategorySetWithSteps/
  CaseRemarkItem/DiscountRequestItem/BonusRequestItem.
  `src/lib/office/labels.ts` — STATUS_LABELS/STYLES mein WAITING_FOR_FILE +
  WAITING_FOR_PRINTING (naye workflow statuses ke liye).
Verification (ENV RULE — repo mein kuch install nahi): fresh copy /tmp/w4b
(repo sans node_modules rsync; fresh `npm install --no-audit --no-fund`),
`npx prisma generate` OK, `npm run typecheck` ZERO errors (latest repo state
incl. other agents' files), `next lint` on all touched files clean.
NOT committed, per instructions.
Caveats:
- "Dates generate karein" button cashier/atta ko dikhta hai per brief, lekin
  API office:attestation:write mangta hai (admin bypass) — bina permission
  ke 403 "Unauthorized" message dikhega.
- Courier queue "payment clear" backend simplification waisi hi (Wave-4).
Next step for the next agent:
- Real DB ke sath poora N7 flow smoke test (create → payment receive →
  filing files → printing → atta steps + FINAL → courier slip), aur owner se
  confirm: cashier/atta ko generate-dates permission deni hai ya button
  ghata dein.

## [2026-10-08] Agent: Kimi (orchestrator + 7 coder waves) — Wave 2 COMPLETE (06_NEW_REQUIREMENTS.md N1–N11)
Done (all waves, typecheck+lint green in /tmp/final clean env, prisma validate green):
- N1 AdminNav direct office items; N2 office creation with inline users/roles API+UI; N3 floating buttons hidden on /admin+/office.
- N4 roles filing/printing/atta/courier + permissions; N5/N6 date engine (date-engine.ts, hijri.ts, board-attas.ts, rnumber.ts) + set APIs + holidays/date-pool CRUD + setup panels; N7 dept workflow (files, statuses, remarks, urgent, queues, filing-limited view, courier in-app viewer); N8 discount/bonus flows + office expenses accounting; N9 finance rules + isolation (office:cases:read-all) + DepartmentLink APIs/UI; N10 seed updated; N11 `impossible` file in repo root.
- Integration fix by orchestrator: generate-dates route now allows atta/payments:verify; BotChatWidget lint warning fixed.
Verification: `npm run typecheck` exit 0, `npm run lint` exit 0, `npx prisma validate` valid. `next build` NOT run (needs real DATABASE_URL at prerender — pre-existing).
Next step (owner): on real DB run `npx prisma migrate deploy` + `npm run db:seed:office`, fill 2019 pool via Setup panel, smoke-test full chain. See repo-root `impossible` file for limitations.

## [2026-10-08 10:04] Agent: Claude (subagent, AI-first date engine mission) — Wave 2026-10: N5/N6 AI-FIRST rework (docs 06)

Task: owner ka asli mutalba — date engine AI-FIRST ho: AI research ker ke DECIDE
kare (Pakistan working day, city closure, embassy closure, Saudi working day,
city choice), har verdict record ho (admin edit/delete ker saky), aur 2019 ki 30
working dates AI research ker ke pool mein bhare.

Done:
- NEW `src/lib/office/ai-dates.ts` — AI research layer (callBotJson + DeepSeek
  key from SiteSettings, same pattern as working-day.ts):
  `aiVerdict(dateISO, question)` with questions PAKISTAN / CITY
  (Islamabad/Quetta/Gujrat/Lahore closure due to incident/preparation/strike/
  local holiday) / EMBASSY (embassies in Islamabad closed/suspended) / SAUDI
  (Fri+Sat weekend + Founding Day 22 Feb, Eids, National Day 23 Sep);
  `aiChooseMoofaCity` (AI returns {city, reason}, priority Islamabad → Gujrat →
  Lahore, admin table cross-check, skipped cities recorded as closures);
  `aiResearchWorkingDates(year, count, excludeDates)` batch researcher with
  validation (right year, Mon–Fri, not excluded, not a known PAKISTAN closure).
  CACHING: AI closures upsert into HolidayClosure (reason prefixed "AI:" —
  admin Holidays panel mein show hoti hain, edit/delete-able; admin rows bina
  "AI:" prefix ke MANUAL hain aur kabhi overwrite nahi hote); Pakistan verdicts
  WorkingDayCache mein (source "AI"; MANUAL rows win). Ek AI call 14-din ka
  closure scan karta hai aur poora window cache ho jata hai. Fallback SIRF jab
  key missing / call fail / invalid JSON → deterministic weekend + table rule
  (console.warn ke sath).
- `src/lib/office/date-engine.ts` AI-FIRST: har step formula (BORD dono
  families, UV/QR idcc, SPECIAL_MOOFA city via AI, SAUD_MBC Islamabad+embassy+
  Tue–Fri, MOOFA_SAUD Saudi Sun–Wed, BMFQ_VER/MOH_ATTA/CPLS_ATTA/APAC_ATTA/
  NEVTCC) ab har candidate day ko ai-dates se validate karta hai (scopes
  parallel Promise.all — ek window ≈ ek AI round-trip). Purane pure functions
  (loadClosures/isBlockedDay/firstWorkingDayWith) fallback layer ke tor par
  rakhe gaye. generateSetDates signature/contract waisa hi (pending reasons,
  transaction persist, board attas sirf aik dafa). 2019 random pick se PEHLE agar
  pool < 30 → aiResearchWorkingDates se auto-fill + WorkingDatePool upsert.
- `src/app/api/office/setup/date-pool/route.ts`: GET ?suggest=1 ab AI-first
  (source:"AI" suggestions), fail par purana deterministic scan fallback.
- NEW `scripts/ai-fill-date-pool.ts` (args: year, target) — live DB par CHALAYA:
  `npx tsx scripts/ai-fill-date-pool.ts 2019 30` → **Pool 2019: 30/30**, tamam
  30 entries AI-researched (note "AI: normal working <weekday>"), saari Mon–Fri,
  months mein spread, koi known holiday nahi. Exit 0. Koi date manually nahi
  dali gayi.
- Live AI E2E (real DB + real DeepSeek): PK verdicts 2019-08-14 / 2019-06-05
  MANUAL seed table se sahi closed; 2019-05-27 PAKISTAN/CITY/EMBASSY scans
  source "AI"; Saudi 2019-09-23 = AI ne closed kaha (National Day) aur
  HolidayClosure mein AI row upsert ki (ye date seed table mein nahi thi);
  city choice 2019-05-27 → ISLAMABAD (source AI). Formula chain live:
  SPECIAL_MOOFA 2019-05-07 ISB → SAUD_MBC 2019-05-09 (Thu) → MOOFA_SAUD
  13-05-19 (Mon) → BORD(QR) 2026-10-08+5 → 2026-10-13. AI cache ab: 3 AI
  HolidayClosure rows + 37 WorkingDayCache rows.
Verification: `npm run typecheck` exit 0 (clean copy /tmp/aiwork — repo
node_modules is fuse FS par stub hai, ENV RULE ke mutabiq; rsync se latest repo
state incl. doosre agent ke files).
Half-done / caveats:
- deepseek-v4-pro reasoning model hai: latency 30–240s per call, aur kabhi
  kabhi 90s timeout ya empty-content (reasoning ne poora token budget kha jata
  hai) — us waqt FALLBACK chalta hai + console.warn. Pehli dafa uncached dates
  par generateSetDates minutes le sakta hai: generate-dates / set / payments
  routes mein `maxDuration` export NAHI hai (default ~10–60s platform ke hisab
  se) — **agla agent/owner in routes par `export const maxDuration = 300`
  add kare** warna pehli AI generation time out ho sakti hai (cache bharne ke
  baad instant).
- City-choice direct {city,reason} call is model par flaky hai; middle layer
  per-city AI scans se city derive karta hai (phir bhi AI, cached) — table sirf
  aakhri fallback.
Files touched:
- src/lib/office/ai-dates.ts (NEW), src/lib/office/date-engine.ts (rework),
  src/app/api/office/setup/date-pool/route.ts (AI suggest), scripts/ai-fill-date-pool.ts (NEW),
  docs/office-module/05_AGENT_LOG.md (this entry).
Next step for the next agent:
- `export const maxDuration = 300` on generate-dates / set / payments routes;
  phir live DB par poora set-generation smoke test (case + payment + set).

## [2026-10-08 18:07] Agent: Kimi (UI coder, subagent) — Wave 7: owner complaint fix (06 N1 continuity + N2/N3 review)

Task: owner complaint "admin k UI meri requirements k mutabiq nahi hua" — /office/*
pages super admin ko alag-setup jaisi OfficeNav header ke sath dikh rahe thay.

Done:
- N1 FIX: `OfficePageFrame` ab `admin.role === "admin"` par wahi `AdminNav`
  render karta hai jo admin panel par hai (same logout handler reuse), taake
  office options click karne par ek continuous admin panel mehsoos ho.
  Office-role users (booking/cashier/filing/printing/atta/courier) ke liye
  `OfficeNav` (apna brand + department links dropdown) bilkul waisa hi.
  AdminNav mein office items pehle se direct mojood hain (Wave-2), isliye
  koi secondary tab row zaroori nahi.
- N1 review: AdminNav ke office items `overflow-x-auto` nav ke andar hain —
  mobile par layout nahi tootta (item 2 of brief, no change needed).
- N2 review: `/office/setup` create card multiple inline user rows (naam,
  email, password show/hide, role dropdown — tamam 7 roles incl. filing/
  printing/atta/courier) ek hi submit mein bhejta hai; API `POST
  booking-offices` `users[]` ko ek transaction mein banata hai (verified,
  touched nahi). Mojooda office mein `OfficeUsersEditor` se user add hota
  hai. Sab pehle se sahi implemented — koi gap nahi mila.
- N3 review: `BotChatWidget` (`if (!enabled || hidden) return null` —
  hidden = /admin ya /office) aur `FloatingHomeButton` dono /admin + /office
  par render nahi hote. `SubmitQuestionModal` sirf CoursePageView ka
  confirmation modal hai (koi floating trigger nahi). Verified, no change.
- Polish: `/office` dashboard "Recent cases" empty state — icon + Roman-Urdu
  hint ("Naya case banane ke liye oopar 'New case' par click karein").
Files touched:
- src/components/office/OfficePageFrame.tsx (AdminNav for super admin),
  src/app/office/page.tsx (empty state polish),
  docs/office-module/05_AGENT_LOG.md (this entry).
Verification (ENV RULE — repo node_modules fuse FS par unstable hai):
- Fresh copy /tmp/w7 (repo sans node_modules), `npm install` OK,
  `npx prisma generate` OK, `npm run typecheck` EXIT 0 (0 errors),
  `npx next lint` dono touched files par clean. NOT committed.
Next step for the next agent:
- Live DB par owner-flow smoke test: super admin login → admin nav se
  Cases/Setup click → header ka continuity check.

## [2026-10-08 19:38] Agent: Kimi (coder, subagent) — Wave 8: owner fixes (tx timeout + panel speed + toast popups)

Task: teen owner complaints — (P1) booking-office create par Prisma interactive
transaction "Transaction not found / old closed transaction" error, (P2) admin
panel bohot slow (AI date generation request path mein), (P3) har success/info
message popup toast ho (auto-close, hover pause, close button).

Done:
- P1 root cause: `prisma.$transaction(async (tx) => ...)` ka default 5s
  `timeout` remote DB (ap-southeast-1) + bcrypt hashing + multiple writes ke
  sath khatam ho jata tha — tx mid-flight close, phir `findUnique` "transaction
  not found". FIX: tamam 11 interactive transactions (bonus-requests,
  discount-requests, office-expenses x2, cases POST, cases/[id]/files POST,
  setup/booking-offices POST, booking-offices/[id]/users POST, commission.ts,
  date-engine.ts persist phase, profit-share.ts) ko `{ maxWait: 10000,
  timeout: 30000 }` options diye. Array-style `$transaction([...])`
  (commissions/route.ts) untouched.
- P1 bcrypt: `createOfficeUser` (src/lib/office/office-users.ts) ab pre-hashed
  password leta hai — naya `hashOfficeUserPassword` helper + dono callers
  (booking-offices route `Promise.all(users.map(...))` tx se PEHLE,
  booking-offices/[id]/users route) hashing transaction ke bahar karte hain.
  Tx time ab pure DB work.
- P2a: `activateWorkflowOnFirstPayment` (workflow.ts) ab sirf fast status
  update karta hai aur `{ datesNeeded }` return karta hai; AI-heavy
  `generateSetDates` dono payment routes (payments/route.ts POST direct
  RECEIVED, payments/[id]/route.ts PATCH verify) mein
  `after(async () => { try { await generateSetDates(caseId) } catch ... })`
  se background mein schedule hota hai — response foran return. Fast DB work
  (evaluateCaseCompletion, attestations route) awaited hi rakha.
- P2b: cases/[id]/set/route.ts pehle se sirf RECEIVED payment hone par
  generation await karta tha — acceptable per brief, no change.
- P2c: /admin/login page ka `/api/office/setup/department-links` fetch (logged-
  out par 401) hata diya — sirf static hint "Department links admin se hasil
  karein". OfficeNav links dropdown ab LAZY fetch karta hai sirf pehli dafa
  dropdown khulne par, state mein cache (har page load par nahi).
- P2d: dashboard route (groupBy + 3 parallel queries) aur cases list
  (`unseenWarningCaseIds` pehle se ek batched `in: caseIds` query) mein N+1
  nahi mila — verified, no change.
- P3: naya `src/components/Toast.tsx` — fixed top-right z-[100] popup,
  4s auto-dismiss, hover par timer PAUSE (remaining-time logic), hover hatne
  par resume, close button, thin progress bar; kinds success (emerald) /
  error (red) / info (slate). Naya `src/hooks/useToast.tsx` (toast, showToast,
  clearToast, ToastElement).
- P3 sweep: inline emerald banner pattern (`{message && (<div...>)}`) HATA kar
  Toast popup lagaya — admin/page.tsx, admin/settings/page.tsx (+
  SiteSettingsPanel), SubAdminPanel, VisitorTrackingPanel, BotAdminPanel,
  office setup page (+ SetupPanels, WorkingDayPanel, HolidayPanel,
  DatePoolPanel, DepartmentLinksPanel), office ledger page (+ Salaries/
  CompanyExpenses panels), office payments page, office cases/[id] page,
  FilingCaseView. `onMessage` prop types widened: `(message, kind?: ToastKind)`.
  API failure messages ab `kind="error"` toasts hain; existing `setMessage`
  call sites kept (wrapper same name). Logic unchanged — sirf display.
Files touched: upar listed sab + docs/office-module/05_AGENT_LOG.md (this entry).
Verification (ENV RULE — repo node_modules fuse FS par npm install NAHI):
- Fresh copy /tmp/fix1 (rsync repo sans node_modules/.git), `npm install
  --no-audit --no-fund --ignore-scripts` OK, `npx prisma generate` OK,
  `npm run typecheck` EXIT 0 (0 errors, baseline bhi green tha),
  ESLint (project .eslintrc.json, next/core-web-vitals + next/typescript)
  tamam ~35 touched files par clean (0 warnings/errors). NOT committed.
Next step for the next agent:
- Live par smoke test: office create with users (tx timeout fix), payment
  RECEIVED verify (response instant, dates background mein), toast hover
  pause behavior. Vercel par `after()` fluid-compute ke sath kaam karta hai —
  self-hosted dev server par bhi chale ga, lekin background completion ki
  guarantee sirf Vercel par hai.

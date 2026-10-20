# 06 — New Requirements (owner brief, 2026-10-08) — source of truth for Wave 2026-10

Restated precisely from the owner's Roman-Urdu brief. When code disagrees, this wins.
Existing module docs (00–05) still apply (style, audit log, Decimal money, hand-written
idempotent migrations, Roman-Urdu UI messages, typecheck must pass).

## N1. Admin nav — Office options directly visible
- All office options (Cases, Payments, Ledger, Finance, Setup, …) show **directly in the
  admin top nav** (`AdminNav`) for users with office permissions — not hidden behind a
  single "Office" entry that feels like a separate setup. Keep `/office/*` pages and
  `OfficeNav`; this is about admin-side visibility/access.

## N2. Office creation with roles + users inline
- When super admin creates a booking office, in the SAME place they can also create its
  roles/users: for each user a **user id (email) + password + role** (booking office
  member, cashier, filing, printing, atta, courier…) — without going to a separate
  sub-admin page. Elegant, easy-to-use UI (cards, clear sections, inline add rows).

## N3. Floating buttons hidden on admin/office pages
- "Sawal poochein" (BotChatWidget / SubmitQuestionModal trigger) and the floating Home
  button (FloatingHomeButton) must NOT render on any `/admin/*` or `/office/*` page.
  They only show on the public website. Implement via pathname check in those client
  components (return null when pathname starts with /admin or /office).

## N4. Departments (new roles)
New office roles alongside `cashier`, `attestation`, `booking_office`:
- `filing` — Filing department
- `printing` — Printing department
- `atta` — Atta (attestation) department
- `courier` — Courier department
Super admin can grant ANY user ANY combination of department permissions
(e.g. a booking-office user may also get filing; another filing+printing+atta+courier).

## N5. Category sets (document attestation sets)
Categories (seed exactly, keep existing ones):
1. `Matric Tech`
2. `DAE 3Y BBTE`
3. `DBA 3Y BBTE`
4. `1-2 Y BBTE`
5. `Medical Bmfq`
6. `CPLS`
7. `APAC`

Each category has **sets**; each set is an ordered list of **steps**. Steps and their
meaning (all dates are working-day computed, see N6):

Steps glossary: `Board` (board attestation; generates Board Attestation Number), `UV ibcc`,
`QR code ibcc`, `Special Mofa` (with city), `Saudi Embassy` (Islamic/hijri date also shown),
`Mofa Saudi` (Saudi working day, dd-mm-yy solar), `Back Navttc`, `Current Navttc`,
`bmfq verification`, `MoH attestation`, `CPLS attestation`, `Navttc`, `APAC attestation`.

### Matric Tech (uses Category-4 formulas)
- (i) Board + UV ibcc + Special Mofa — formulas of set 4(i) for Board/UV ibcc/Special Mofa
- (ii) Board + QR code ibcc + Special Mofa — formulas of set 4(ii)
- (iii) Board + UV ibcc
- (iv) Board + QR code ibcc
- (v) Board

### DAE 3Y BBTE (= "category 4")
- (i) Board + UV ibcc + Special Mofa + Saudi Embassy + Mofa Saudi
- (ii) Board + QR code ibcc + Special Mofa + Saudi Embassy + Mofa Saudi
- (iii) Board + UV ibcc + Special Mofa
- (iv) Board + QR code ibcc + Special Mofa
- (v) Board + UV ibcc
- (vi) Board + QR code ibcc
- (vii) Board

Roll Number (roll number) last-2-digit logic for sets of this category:
- last two digits ∈ {22..29}: Set of Attestations (i)/(v-style full sets) are shown DIMMED (disabled) to
  the record creator.
- last two digits ∈ {19, 20, 21}: Board + UV ibcc dates are in year 2020 / 2021 / 2022
  respectively.
- otherwise (any other suffix incl. 19–21 handled above): Board date = a random pick from
  the **2019 working-date pool** (admin-editable list of 2019 working dates; system
  collects up to 30 and then uses them randomly; admin can edit/delete entries).
  UV ibcc = a working date in the same year, ≥ 3 days after the Board date (paired and
  recorded with the Board date).

Board Attestation Number (auto-generated when a Board step date is assigned):
`[last digit of Board-date year][month 2 digits][3-digit global sequential count]`
= 6 digits total. If it would start with `0`, replace that leading `0` with `8`.
Global counter across ALL cases (model `BoardAttestationCounter`).

Special Mofa date: first available working day **7 days after the FIRST payment date**
(payment date + 7 → first working day). Must not be a Pakistan holiday; city = Islamabad
unless Islamabad is marked closed that day (holiday/closure table) → then Gujrat, else
Lahore (first open city, priority Islamabad → Gujrat → Lahore). City name stored with date.

Saudi Embassy date: 2 days after Special Mofa → first available **Islamabad** working day
falling on **Tue/Wed/Thu/Fri** (and Islamabad not marked closed / embassy-closure flag in
holiday table). Hijri (Islamic) date also computed (tabular calendar) and shown.

Mofa Saudi date: 4 days after Saudi Embassy → first **Saudi Arabia working day**
(Saudi weekend = Fri+Sat) falling on **Mon/Tue/Wed** (Sunday removed per owner, 2026-10-08);
stored/displayed as `dd-mm-yy`.

Set of Attestations (ii) formulas (QR code ibcc variant):
- Board date = first available working day **5 days after first payment date**; must not
  be a Pakistan holiday and **Quetta** must not be marked closed that day.
- QR code ibcc = Board + 2 days → first available **Islamabad** working day.
- Special Mofa = QR ibcc + 1 day → first available day among Islamabad/Gujrat/Lahore
  (priority Islamabad first, city stored).
- Saudi Embassy / Mofa Saudi same as set (i).

### DBA 3Y BBTE
Same 7 sets (i–vii) and same formulas as DAE 3Y BBTE.

### 1-2 Y BBTE
- (i) Board + Back Navttc + Special Mofa + Saudi Embassy + Mofa Saudi — formulas of set 4(i)
  with `Back Navttc` in place of `UV ibcc`.
- (ii) Board + Current Navttc + Special Mofa + Saudi Embassy + Mofa Saudi — formulas of set
  4(ii) with `Current Navttc` in place of `QR code ibcc`.

### Medical Bmfq
- (i) bmfq verification + MoH attestation + Special Mofa: bmfq verification = first payment + 5 days → first
  working day (Pakistan holiday-free, Quetta not closed). MoH attestation = bmfq verification + 2 days →
  first Islamabad working day. Special Mofa = MoH attestation + 1 day → first available of the
  3 cities (priority Islamabad).
- (ii) bmfq verification + MoH attestation (same first two formulas).
- (iii) bmfq verification only.

### CPLS
- (i) CPLS attestation + Navttc + special mofa: CPLS attestation = first payment + 3 days → first
  working day (Pakistan holiday-free, Islamabad not closed). Navttc = CPLS attestation + 1 day →
  first Islamabad working day. special mofa = Navttc + 1 day → 3-city rule.
- (ii) CPLS attestation + Navttc. (iii) CPLS attestation only.

### APAC
Same as CPLS with `APAC attestation` in place of `CPLS attestation`.

## N6. Working-day engine
- Pakistan weekend: Sat+Sun. Saudi weekend: Fri+Sat.
- Admin-editable **Holiday/Closure table**: date, scope (PAKISTAN | ISLAMABAD | QUETTA |
  GUJRAT | LAHORE | EMBASSIES_ISB), reason. Seed with well-known Pakistan public holidays
  2019–2026 (recurring dates like 23 Mar, 14 Aug, 25 Dec, Kashmir Day 5 Feb, Labour Day
  1 May, Defence Day 6 Sep, Iqbal Day 9 Nov, Quaid 25 Dec; Eid ranges marked as
  approximations editable by admin).
- **2019 pool**: table of 2019 working dates (admin can add/edit/delete); system suggests
  dates until 30 exist; random pick when needed. Store the pick + its UV-ibcc pair on the
  case attestation step.
- The existing AI working-day helper (`working-day.ts`) stays for expected-printing-date;
  the set engine is deterministic over the holiday tables (AI call optional enhancement).

## N7. Case creation & workflow (booking office roles: partner / mulazam / commission agent)
Create record with: name (optional), category (select), Roll Number **or** Registration Number
(at least one compulsory), remarks (optional), picture of client (optional), contact
number (optional), address (optional).
After creation, open the record to add: **Agreed Amount** (+ optional remarks),
**set selection** from that category's sets, payments.

Statuses (extend existing):
- After first payment marked RECEIVED by cashier/super admin → case becomes visible to
  **filing** department, status `WAITING_FOR_FILE`. Filing sees ONLY: category, Roll Number,
  Registration Number, remarks, picture of client (no payment details).
- Filing can add **targeted remarks** (choose recipients: admin / booking office /
  printing — one or many; only selected recipients see them; shown as a **warning** to
  the target) even before uploading files.
- Filing uploads 1+ files (pdf / image / pdf+image / 2 pdf / 2 images) → status
  `WAITING_FOR_PRINTING`.
- Printing downloads filing files, sees all set dates, can create remarks for other
  departments, uploads printed proof (images / video / pdf) into **before-atta** section
  → status `PRINTED` (+ `isPrinted`).
- If a case's set is NOT selected when printing marks it Printed → booking office sees a
  **red warning** on that case (hover/detail explains: set not selected).
- Attestation department: sees set dates; marks each step's status as it completes; optional
  file per step; **after the last step a final file (image/pdf/video) is mandatory** →
  status moves to attestation-complete (`COMPLETED` pending courier info).
- Booking office can also create remarks directly for the attestation department.
- Courier: when all set steps complete AND payment clear AND courier number + address
  exist → courier dept sees the case with client name, Roll Number, Registration Number, address,
  courier number; printing + attestation files visible **in-app** (viewer, not just download).
  Courier uploads courier slip (visible to admin + booking office) → status `DELIVERED`.
- `Urgent` badge: booking office can allot an Urgent badge to a case.
- Payments 2/3/final reduce remaining when RECEIVED (existing behaviour).

## N8. Discount & bonus
- Discount on agreed amount: booking office can only **request**; admin approves with a
  popup choosing: minus from **commission** / **admin profit** / **partial** (split).
- Bonus: booking office can request a bonus; admin accepts and decides whether the bonus
  comes from commission or admin profit.
- Case expenses entry option on cases list + detail for admin and cashier.
- Commission & salary office expenses come out of the **admin's account**; partner
  (profit-share) office: expenses deducted first from the whole, then profit distributed
  per share. Commission-office general expenses minus from that user's commission, but
  **case expenses never reduce commission**.

## N9. Finance & isolation
- Every booking office has its own earning ledger (already exists; keep).
- One office cannot see another office's data, unless admin grants a special permission
  (`office:cases:read-all`).
- Multiple users of the same office see all cases of their office; each user sees their
  own profit margin / remaining.
- Per-user ledger: every payment received shows in that user's ledger; user expenses can
  be added to their ledger; office expenses show in the office ledger.
- Admin income tracking: monthly / weekly / custom range (exists; keep and ensure
  includes new expense rules).
- Settings: admin can add **department access links / domains** (label + URL list in
  SiteSettings or new table; DNS added manually in Vercel by owner — just store + display
  on login/setup pages).

## N10. Seed & tables
- Update office tables + seeded data to match everything above (categories, sets with
  steps, attestation types superset, holiday seeds, 2019 pool empty-but-ready, department
  roles in presets).

## N11. If something is impossible
- Create `impossible` file in repo root explaining precisely what could not be done.

---

# WAVE 11 (2026-10-09) — Owner FINAL polish: status flow, finance timing, notifications, live refresh, speed

## W11.1 — EXACT case status flow (replaces all previous status lists)
Order is fixed. Display labels MUST be exactly these (English short labels, one glance clear):

| # | Status key | Label |
|---|-----------|-------|
| 1 | FIRST_PAYMENT_PENDING | 1st payment pending |
| 2 | WAITING_FOR_FILE | Waiting for file |
| 3 | WAITING_FOR_PRINTING | Waiting for printing |
| 4 | PRINTED | Printed |
| 5 | ATTESTATION | dynamic: `Attestation: <current attestation name>` via Case.currentAttestationId |
| 6 | ATTESTATION_COMPLETE | Attestation complete — final payment pending |
| 7 | WAITING_FOR_COURIER | Payment complete — waiting for courier |
| 8 | DELIVERED | Delivered |
| 9 | MUSADIQA_APPLIED | Musadiqa applied |
| 10 | MUSADIQA_FEES_PAID | Fees paid for Musadiqa |
| 11 | MUSADIQA_SENT_BY_BOARD | Musadiqa verification sent by board |
| 12 | MUSADIQA_VERIFIED | Musadiqa verified |
| — | CANCELLED | Cancelled |

Legacy keys NEW / PAYMENT_PENDING / IN_PROCESS / COMPLETED were migrated in DB
(NEW/PAYMENT_PENDING→FIRST_PAYMENT_PENDING, IN_PROCESS→WAITING_FOR_FILE,
COMPLETED→ATTESTATION_COMPLETE). Keep legacy labels as fallback only.

Auto-transitions (system):
- Case create → FIRST_PAYMENT_PENDING.
- First payment RECEIVED → WAITING_FOR_FILE.
- Filing dept first file upload → WAITING_FOR_PRINTING.
- Printing dept first file upload (or isPrinted) → PRINTED.
- Attestation step IN_PROGRESS → status ATTESTATION + currentAttestationId=that step.
- All set attestations DONE + final ATTA file → ATTESTATION_COMPLETE (was COMPLETED).
- Payments fully received (remaining=0, agreed>0) while ATTESTATION_COMPLETE → WAITING_FOR_COURIER.
- Courier slip upload → DELIVERED.
- Musadiqa statuses: manual by admin.

Admin manual change (dropdown in cases LIST row + detail page):
- Admin may jump to ANY status; note/reason lazmi (already enforced).
- Dropdown options per row = 12 fixed statuses + one option per attestation of that
  case (`Attestation: <name>`), in flow order, current one marked.
- Selecting attestation option: status=ATTESTATION, currentAttestationId=selected,
  attestations before it → DONE (completedDate=today if null), selected → IN_PROGRESS,
  later → PENDING.
- Selecting ATTESTATION_COMPLETE or later → ALL attestations → DONE.
- Selecting PRINTED or later → isPrinted=true, printedAt set.

## W11.2 — Cases list UX
- Whole row/box clickable → opens detail (router.push + prefetch on hover),
  EXCEPT expense button and status dropdown (stopPropagation).
- Admin sees inline status dropdown per row; change → note modal → PATCH → toast → list refresh.
- Mobile: cards instead of table on small screens.

## W11.3 — Detail page
- Remove bulky CaseStepper; slim status header: big current status chip + next-step hint +
  admin status dropdown (same component as list).
- Tabs stay but compact; History tab fetches audit lazily from new GET /api/office/cases/[id]/audit.
- Filing-visibility admin toggle (see W11.6) in Files tab header.
- Live refresh (W11.5).

## W11.4 — Finance timing
- PROFIT_SHARE (partner) office: on EVERY payment turning RECEIVED, auto-distribute:
  pool = received − case expenses − office expenses (floor 0); each active member gets
  profitPercent% of pool credited (idempotent ADJUSTMENT rows); remainder (100−sum%)
  is admin share — show in profit summary as adminShare. No manual finalize needed
  (keep button harmless). Contract: `autoDistributeOnPaymentReceived(caseId, session)`
  in src/lib/office/profit-share.ts; called from payment verify + recompute path.
- FIXED_COMMISSION office: 50% commission credited on FIRST received payment, remaining
  50% when remaining=0 (already the logic) — NEW: ledger entries carry memberId of the
  BookingOfficeMember linked to case.createdByAdminId (per-user ledger attribution).
  Fallback memberId=null when creator is not a member.

## W11.5 — Live refresh + speed
- Websockets not viable on serverless → polling infra:
  - src/hooks/useLiveRefresh.ts: interval (15s, only when tab visible) + window focus +
    custom event `office:changed` (dispatched by officeFetch after successful mutations)
    with 300ms debounce.
  - Apply on: cases list, case detail, office dashboard, payments page, ledger page.
- Speed: loadCaseDetail parallel Promise.all; audit log moved to lazy endpoint;
  nav-counts single aggregated endpoint; list route count+findMany parallel.

## W11.6 — Booking office filing-file permission
- Case.filingFilesVisibleToBooking (default false). Booking office users do NOT see
  CaseFile rows with department=FILING unless this flag is true. All other departments'
  files visible. Admin toggles per case (PATCH case field, admin-only). UI toggle in
  Files tab header (admin only) + indicator for booking users.

## W11.7 — Navbar badges
- GET /api/office/nav-counts → ONE call returns role-based counts:
  { cases, payments, requests, unreadNotifications }.
  - cases: dept roles → their queue size; booking → own cases with unseen remarks;
    admin → cases with unseen ADMIN remarks + set-missing warnings.
  - payments: PENDING payments in scope.
  - requests: pending DiscountRequest + BonusRequest (admin/cashier only).
- OfficeNav + AdminNav show amber count bubble on Cases/Payments/ledger items; poll 30s.

## W11.8 — Notification system
- Table Notification (userId, type, title, body, link, readAt).
- Helper src/lib/office/notifications.ts: notifyUsers(ids, n), notifyRole(role, n),
  notifyAdmins(n). Never throws (fire-and-forget with console.error).
- Fire points: case.create→admins; payment.submit→verify-permission users;
  payment.verify→submitter+case creator; case.status→case creator + users of the
  dept that owns the new stage (filing/printing/atta/courier); file.upload→admins +
  next-stage dept users; remark.create→target dept users; attestation DONE→atta+admin;
  discount/bonus request create→admins, decided→requester.
- APIs: GET /api/office/notifications (own latest 20 + unread count),
  POST /api/office/notifications/read { ids?: string[] } (default: mark all read).
- Bell icon in OfficeNav + AdminNav: unread badge, dropdown (title/body/time), click →
  link + mark read, "Mark all read". Poll 20s.

## W11.9 — Booking navbar
- "Links" (DepartmentLinks) dropdown: hide for all roles except super admin
  (booking office users found it confusing).

## W11.10 — Verification bar (MANDATORY before done)
- npm run typecheck = 0 errors, npm run lint = 0, next build exit 0 against real DB.
- Every changed flow manually traceable to this SPEC.

---

# WAVE 12 (2026-10-09) — Speed deep-pass, nav fix, Finance merge, force delete, retroactive formulas

## W12.1 — Speed (top priority, owner's #1 complaint)
- Slim mutation responses: status PATCH and other case mutations return MINIMAL json
  ({ok, status, currentAttestationId, ...}) instead of full loadCaseDetail; UI updates
  local state (live-refresh covers the rest).
- No sequential awaits anywhere in hot routes — Promise.all everywhere.
- /api/auth/me must stay JWT-cheap; client session cache already 60s.
- Admin course APIs: trim heavy includes.
- Every office API keeps preferredRegion=["sin1"].

## W12.2 — Navbar overlap fix
- Root cause: bell/badges inside `overflow-x-auto` flex row — dropdown clipped, items
  overlap. Fix with proper 3-zone layout: brand (shrink-0) | scrollable nav (min-w-0
  flex-1 overflow-x-auto, scrollbar hidden) | actions (shrink-0). Badges absolute
  inside their button. Notification dropdown rendered outside the scroll container
  (fixed positioning anchored to bell rect) so it never clips.

## W12.3 — Ledger + Finance merge into ONE simple Finance page
Admin needs at ONE glance:
- Payments: kon kon si payments aain, kis case ke sath attached (case number + link),
  amount, method, date, status.
- Users earnings table (ALL members across offices): name, office, TOTAL EARNING
  (credits: COMMISSION_*/EXTRA_SHARE/PROFIT_SHARE/BONUS), WASOOL (PAYOUT debits),
  DUE (earning − wasool). Click a user → detail: har earning entry (type, case, date,
  amount) + har payout (date, method, amount, remarks).
- Keep existing company income summary as a compact strip on top (do not remove).
- Nav: "Ledger" item removed; /office/ledger redirects to /office/finance.
- New APIs: GET /api/office/finance/users (summary, all members + balances),
  GET /api/office/finance/users/[memberId] (earnings + payouts lists).
- Booking-office role keeps its own scoped ledger view (existing page behavior where
  role==booking_office) — the merge targets the admin/cashier experience.

## W12.4 — Partnership rule (confirmation)
Pool = received − case expenses − office expenses, THEN share percents (already
implemented in wave-2/§N8 + wave-11 auto-distribute). Verify, don't regress.

## W12.5 — Admin force delete case
- DELETE /api/office/cases/[id]: admin may delete ANY case (remove the received-payment
  /ledger guard). Full cascade in one transaction: ledger entries (caseId + paymentId),
  expenses, attestations, remarks (+recipients), contacts, addresses, discount/bonus
  requests, files rows, payments; then case row. R2 objects (case files, payment slips,
  client picture) deleted best-effort after commit. Audit logs for the case removed.
  Notifications linking to the case removed. Money effect: deleting ledger rows
  automatically reduces users' earnings/wasool balances everywhere.

## W12.6 — Formula changes retroactive vs admin percent changes
- Case.profitShareSnapshot (Json {memberId: percent}) written on FIRST distribution of
  a case. finalizeProfitShare uses snapshot when present → admin changing a member's
  profitPercent from the panel does NOT alter old cases; new cases use new percents.
- CODE formula corrections ARE retroactive: scripts/recompute-finance.ts — for every
  PROFIT_SHARE case: clear snapshot + finalize (idempotent ADJUSTMENT rows apply the
  corrected formula); for every FIXED_COMMISSION case: recomputeCaseFinancials; plus
  backfill memberId=null commission/extra-share ledger entries from case creator's
  member. Run once against live DB after deploy.
- Commission amount already snapshots per case at creation (grid changes don't touch
  old cases) — consistent philosophy.

## W12.7 — Notification bell bug
Dropdown clipped by navbar overflow container (opens weird/cut). Fix per W12.2
(fixed-position dropdown anchored to bell) + verify click → open list, item click →
navigate, mark-read works.

---

# WAVE 13 (2026-10-09) — Maximum speed + case delete UI

## W13.1 — Sliding JWT refresh (ROOT CAUSE of persistent slowness)
Login JWT gets `iat` ONCE; after 15 min the fast path expires and EVERY API call
for the remaining 7 days pays a cross-region DB query. Fix: sliding refresh —
auth/me (and any guarded route where practical) re-issues a fresh JWT cookie
(new iat, same claims) whenever the token is stale-but-valid, so the fast path
keeps working for active users. Cookie: admin_session, httpOnly, secure prod,
sameSite=lax, maxAge 7d, path=/.

## W13.2 — Mutations feel instant (after() for non-critical writes)
Audit-log inserts + notification inserts must NOT block mutation responses.
Wrap them in next/server `after()` (fire post-response, still awaited by the
platform) across hot routes: cases status PATCH, case PATCH, payments POST +
verify PATCH, expenses POST, remarks POST, attestations PATCH/complete-all,
files POST/DELETE, discount/bonus decisions, setup writes. Business writes stay
in the request path; only audit + notify move to after().

## W13.3 — Case delete UI (backend DELETE already live)
- Cases list: admin sees a small trash icon per row (stopPropagation) → confirm
  modal ("Ye case aur us ka sara record (payments, ledger, files) hamesha ke
  liye delete ho jayega" + case number + confirm/cancel) → DELETE → toast →
  row removed locally.
- Case detail command bar: red "Delete case" button (admin only) → same confirm
  modal → DELETE → router.push("/office/cases") + toast.

## W13.4 — Honest infra note (deliver to user)
preferredRegion code-side hai; Vercel Hobby par dashboard se bhi region free
set ho sakta hai: Project → Settings → Functions → Region → Singapore (sin1).
Ye sab se bara free speed win hai. Agent log mein note karo.

---

# WAVE 14 (2026-10-09) — Expense/payout UX + auto recompute + small fixes

## W14.1 — Case expense: reason OPTIONAL
POST /api/office/cases/[id]/expenses: description optional (store "" when empty).
UI label "Tafseel (optional)".

## W14.2 — Expenses visible in cases list
List payload per case adds `expenseSummary: { count, total, reasons: string[] }`
(reasons = up to 3 latest non-empty descriptions). UI shows compact line per row:
"Expenses: 3 · Rs 12,500" + reasons (tooltip or tiny text).

## W14.3 — Finance: expenses RED
Company summary expenses tile + office expense lists render amounts in red.

## W14.4 — Auto recompute (no manual button)
- Case expense create/delete → after(): finalizeProfitShare(case) for PROFIT_SHARE
  cases with received>0 (snapshot percents honored) → shareholders auto minus.
- Office general expense create/delete → after(): re-finalize ALL that office's
  PROFIT_SHARE cases (received>0) → pool shrinks, shares auto adjust.
- Payment RECEIVED → auto distribute (already live since wave 11). No
  re-calculate button anywhere required; keep manual finalize harmless.

## W14.5 — Shareholder payout with ACCEPT flow
PayoutRequest table (migrated live). APIs:
- POST /api/office/payouts (office:ledger:write): {bookingOfficeId, memberId,
  amount, method?, entryDate, remarks?} → PENDING request + notify member's
  linked admin user.
- GET /api/office/payouts?status=&memberId=&bookingOfficeId= → admin/cashier all;
  booking_office user sees own office; member-linked user sees own requests.
  Items include member name + office name + creator name.
- POST /api/office/payouts/[id]/accept — ONLY the member's linked admin user:
  creates PAYOUT DEBIT ledger entry (same tx), status ACCEPTED, ledgerEntryId,
  decidedById/decidedAt; notify creator.
- POST /api/office/payouts/[id]/reject — member-linked user OR admin/cashier:
  status REJECTED; notify creator.
UI: Finance users table per-row "Pay" button → modal → POST. Admin sees pending
payouts strip (status chips). Booking-office finance view shows pending requests
with Accept/Reject buttons. Notification link → /office/finance.

## W14.6 — Office general expense UI (API exists)
Finance page: "Office expense add" button (office select, amount, description
optional, date) → POST /api/office/office-expenses; recent office expenses list
(red amounts) under it. Booking-office scoped view keeps own-office only.

## W14.7 — Status change reason OPTIONAL
status route: note no longer required (still logged when present).
CaseStatusSelect modal: "Wajah / note (optional)".

## W14.8 — Set-missing warning scope
setMissingWarning only during PRINTED + ATTESTATION (NOT ATTESTATION_COMPLETE
or later) — a case pushed past attestations stops warning.

## W14.9 — New case: category → optional set select
New-case form: after category chosen, fetch /api/office/setup/sets?categoryId=
and show optional "Set of Attestations (optional)" dropdown in the attestation section; POST
/api/office/cases accepts optional setId (connect) so dates engine + workflow
work from creation.

---

# WAVE 15 (2026-10-09) — Office expense share-formula correction + booking nav

## W15.1 — Office general expense: PER-SHARE allocation (owner rule)
Owner rule: office general expense har user ke account se USKE SHARE ke
mutabiq minus hona chahye. Old (wrong) formula: (a) pool subtracted ALL office
expenses from EVERY case (N cases → expense counted N times), and (b) the
EXPENSE debit was office-level (memberId null) so per-member due never moved.
NEW formula:
- finalizeProfitShare pool = received − case expenses ONLY (office expenses
  REMOVED from pool entirely).
- office-expenses POST for PROFIT_SHARE office: per-member EXPENSE DEBIT
  entries, each = amount × memberPercent/100 (active members, percent>0),
  remarks `Office expense share [<officeExpenseId>]: <description>`. If the
  expense has memberId set → full amount to that member only. Admin remainder
  is admin's own cost (no entry). FIXED_COMMISSION + SALARY behavior unchanged.
- office-expenses DELETE: reverse/remove the per-member allocation rows
  (identify via remarks tag) + existing reversal logic for other types.
- The wave-14 refinalizeOfficeCases() call on office expense is REMOVED (pool
  no longer depends on office expenses).

## W15.2 — Retroactive live fix (owner: apply formula to old records)
scripts/fix-office-expense-shares.ts (run once live):
1. Delete old-format office-level EXPENSE DEBIT ledger rows of PROFIT_SHARE
   offices (type=EXPENSE, direction=DEBIT, remarks LIKE 'Office expense:%' —
   NOT 'Office expense share:%').
2. For every existing OfficeExpense of a PROFIT_SHARE office: create per-member
   allocations (percent split or full-to-memberId) with remarks
   `Office expense share [<expenseId>]: <desc>` — skip if already allocated
   (idempotent via remarks tag match per expense id).
3. Re-finalize every PROFIT_SHARE case (new pool) → ADJUSTMENT rows restore
   correct member credits (snapshots keep frozen percents).
Run: DATABASE_URL=... npx tsx scripts/fix-office-expense-shares.ts

## W15.3 — Booking office nav: Finance tab visible
Booking-office users get payout notifications linking /office/finance but the
OfficeNav has no Finance item for them (permission-gated). Fix: OfficeNav shows
the Finance item when role === "booking_office" (scoped view already exists on
the page).

---

## WAVE 16 — Finance perfection: sahi hisab, privacy, multi-office clarity (2026-10-11)

Owner: (1) admin finance tab har office type (FIXED_COMMISSION / PROFIT_SHARE / SALARY) ke liye perfect aur non-confusing. (2) Cases badge set-missing count attestation-complete ke baad bhi 3 pe atka — warning to fix ho gayi thi, count nahi. (3) office ka user doosre user ka money data NA dekhe (na earning na due). (4) user ka DUE abhi bhi galat — office general expenses share ke mutabiq minus nahi ho rahe. (5) pora office section review — kuch confusing/galat na rahe. (6) multiple offices ke liye design clear. (7) admin navbar "Office" tab ka purpose clear ho aur contents mutabiq hon. (8) world-class polish.

Root causes found:
- finance/users `due = earning − wasool` mein EXPENSE debits (wave-15 per-share office expense allocations) shamil nahi — due galat.
- nav-counts SET_MISSING_STATUSES purani list (ATTESTATION_COMPLETE+ bhi shamil) — W14.8 warning sirf PRINTED/ATTESTATION pe hai; badge diverge.
- booking scoped finance view (BookingOfficeLedgerView) tamam members ke balances + tamam payouts + tamam offices ke expenses dikhata tha — privacy leak.
- office-expenses GET non-admin ko tamam offices ke expenses deta tha — leak.
- /office dashboard + admin nav tab ka maqsad unclear; multi-office view nahi.

### Schema — KOI CHANGE NAHI (live DB verified 2026-10-11)
- Live DB clean hai: tamam LedgerEntry rows ka memberId mojood (koi legacy office-level commission rows nahi — sirf PROFIT_SHARE / ADJUSTMENT / EXPENSE / PAYOUT types), Case.profitShareSnapshot pehle se member-ID keyed hai. Is liye na migration chahye, na backfill. Wave 16 sirf API + UI ki wave hai.

### W16.1 Due = earning − expense share − wasool (finance/users)
- Per member-row: `earning` = net CREDIT−DEBIT over EARNING_TYPES **excluding EXPENSE**; `expenseShare` = EXPENSE debits total; `wasool` = PAYOUT debits; **`due = earning − expenseShare − wasool`** (round2). Row mein `officeName`, `officeType` bhi.
- SALARY type members: earning/expense/wasool/due sab ledger-driven (aam tor pe 0) + UI mein "Salary" chip — confusion zero.
- Non-admin (booking_office) session ko SIRF apni member rows return hon (doosron ka data kabhi nahi).

### W16.2 Member drill-down mein expenses bhi (finance/users/[memberId])
- Response mein `expenses: []` (EXPENSE debit rows: date, description, amount) aur summary mein `expenseShare`; `due = earning − expenseShare − wasool`.

### W16.3 Badge fix (nav-counts)
- SET_MISSING_STATUSES = ["PRINTED", "ATTESTATION"] — workflow.SET_WARNING_STATUSES ke bilkul mutabiq (single source: import from workflow).

### W16.4 Privacy scoping (booking office)
- `/api/office/office-expenses` GET: non-admin sirf apni office ke expenses.
- Booking finance page: koi memberBalances doosron ke nahi — sirf apna account card + apne payouts + apni office ke expenses (read-only).
- Ledger detail page admin-only; booking ko link nahi.

### W16.5 Finance page redesign (multi-office clear)
- Admin: KPI strip (received / expenses / dues) → "Offices" cards (per office: type chip, received, expense, due total, [Ledger] link) → "Users' accounts" office-wise grouped table (user | earning | expenses | wasool | due | Pay) → Pending payouts → Payments received → Office general expenses card (expense row mein per-member split show).
- Non-admin: sirf "Mera account" card (earning − expenses − wasool = due) + apni payout history + apni office ke expenses.
- UserDrawer: credits breakdown + expense deductions + payout history + due.

### W16.6 /office dashboard = Offices overview
- Har visible office ka card: name+type, cases by status (mini), pending payments count+amount, total received, members dues total; card click → /office/cases?bookingOfficeId= (admin) ya scoped list; "Finance" link per office. Non-admin ko bhi apni offices ke cards (cases info only, paisa sirf apna).

### Files
- APIs: finance/users, finance/users/[memberId], office-expenses, nav-counts, ledger (booking privacy), dashboard
- Pages: office/finance/page.tsx (rewrite + drawer + expenses card), office/finance/[officeId]/page.tsx, office/page.tsx (rewrite), components/office/OfficeNav.tsx

---

## WAVE 17 — Terminology rename project-wide (2026-10-11)

Owner ke exact words: idcc→ibcc, attas→attestation, MBC→Embassy, Saud→Saudi, Nevtcc→Navttc, Bord→Board, r-number→Roll Number, reg-number→Registration Number, Moofa→Mofa, Set→Set of Attestations, M Tech→Matric Tech, ver→verification, Dip→Diploma. Categories: `Dip BBTE DAE 3Y`→`DAE 3Y BBTE`, `BBTE DBA 3Y`→`DBA 3Y BBTE`, `BBTE Dip 1-2`→`1-2 Y BBTE`, `M Tech`→`Matric Tech`. AI date-finding engine ke user-facing text + previous records (DB) + har related jagah.

### Code (Agent R)
- Map applied: UI strings, date-engine pending reasons/notes, ai-dates identifiers (`MOFA_CITY_PRIORITY`, `aiChooseMofaCity`), seeds, docs.
- Identifiers: `Case.boardAttasNumber`→`boardAttestationNumber`, `BoardAttasCounter`→`BoardAttestationCounter`, `board-attas.ts`→`board-attestation.ts`, `nextBoardAttestationNumber`.
- `RNUMBER_DIMMED_CATEGORIES` → `["DAE 3Y BBTE","DBA 3Y BBTE"]`; CaseAttestationsTab compare `=== "Board"`.
- stepKey constants (BORD/UV_IDCC/…) intentionally unchanged (internal DB keys); `ATTA` file-kind constant unchanged.
- Migration `20261011120000_office_wave17`: column + table rename (data preserved).

### Live DB (orchestrator, applied post-push)
- CaseCategory: 4 renames; AttestationType: 13 renames; CategorySet: `Set (i): …` → `Set of Attestations (i): …` with inner term renames; CategorySetStep labels: same map.
- Historical audit logs / notifications purani wording mein hain (history as-is).
- Verify: tsc 0, lint 0, build exit 0 (real DB).

---

## WAVE 18 — Internal keys rename + department work UX (2026-10-11)

Owner: (1) internal step keys bhi rename karo (BORD→BOARD, UV_IDCC→UV_IBCC, QR_IDCC→QR_IBCC, SPECIAL_MOOFA→SPECIAL_MOFA, SAUD_MBC→SAUDI_EMBASSY, MOOFA_SAUD→MOFA_SAUDI, BACK_NEVTCC→BACK_NAVTTC, CURRENT_NEVTCC→CURRENT_NAVTTC, BMFQ_VER→BMFQ_VERIFICATION, MOH_ATTA→MOH_ATTESTATION, CPLS_ATTA→CPLS_ATTESTATION, APAC_ATTA→APAC_ATTESTATION, NEVTCC→NAVTTC) + jo bhi old terms baaki hon. (2) BUG: booking user AW D ko office:filing:write dene ke bawajood upload option nahi — navbar mein dept tabs hain hi nahi; caseScope own-office tak limited; findAccessibleCase cross-office block. (3) Filing tab → tamam offices ke cases jin ki files pending hain. (4) Printing/Attestation/Courier permission holders ko bhi kaam ke mutabiq clear UI/UX.

### A. Key/term rename (Agent R2 + live DB)
- CASE_DEPARTMENTS/CaseFile.department/REMARK_TARGETS: "ATTA"→"ATTESTATION" (live DB mein 0 rows — safe).
- dept queue key "atta"→"attestation" (URL param + deptQueueWhere + nav-counts).
- Role "atta"→"attestation_dept" (label "Attestation department"; 0 live rows).
- Permission "office:atta:write"→"office:attestation-dept:write" (0 live grants; "office:attestation:write" = attestation OFFICE, untouched — semantic collision avoid).
- stepKeys 13 rename (code + CategorySetStep live UPDATE; CaseFile.stepKey 0 rows).

### B. Department access backend (Agent B2)
- Cases API ?dept=: dept write permission (ya admin/cashier) → tamam offices; warna current scope. Cross-office rows for booking_office = slim serializer (no money) + `limited:true` flag; own-office rows full.
- Case detail: scope fail → any dept write permission → `{ok, limited:true, depts:[...], detail: slim}`; else 404.
- Files GET/POST: access = caseScope OR any dept permission; POST per-department permission unchanged.

### C. Department UX (Agent U2)
- OfficeNav: Filing/Printing/Attestation/Courier tabs by permission → /office/cases?dept=<key>.
- Dept queue polish: office chip/column, per-dept relevant columns (filing: files pending; printing: expected date/isPrinted; attestation: current step; courier: courier number), upload CTA, clear empty states, "Attestation queue" label.
- Case detail limited view (cross-office dept worker): slim header + relevant info + apne department ka upload; koi money data nahi.

---

## WAVE 20 — Badge instant-load fix + 5-round speed program (2026-10-11)

Owner: (1) dept tab counts click/focus ke baghair nahi dikhte — bina kisi interaction ke foran show hon. (2) Admin ke liye DB + R2 se har cheez BOHOT slow; actions bhi slow — time minimum, 5 optimization loops.

### Root cause (badge)
`useLiveRefresh` mount par `run()` kabhi nahi karta — sirf interval (30s) / focus / office:changed. Pehla fetch 30s baad ya pehle click/focus par hota hai. Fix: `immediate` option + useOfficeNavCounts mein enable.

### 5 rounds
- R1: badge immediate fix + hot-path DB indexes (migration) + middleware audit.
- R2: read routes — sequential awaits → Promise.all, slim includes (cases list/detail, dashboard, finance/users, nav-counts, notifications).
- R3: R2 signed URLs parallel/batch + longer cache; setup/static data unstable_cache + mutation invalidation; client double-fetch removal.
- R4: mutations — tx round-trips kam (createMany/updateMany/batch), client optimistic updates jahan safe.
- R5: final audit sweep + bench before/after + verify (tsc 0, lint 0, build 0) + push.

---

## WAVE 21 — Finance profit/remaining + dept commissions + filing UX + viewer/header polish (2026-10-15)

Owner ke points:
- F1: admin finance mein har office ki TOTAL REMAINING (cases ki baqi amounts) show ho.
- F2: admin profit = received − (expenses + commissions + shares + salaries + dept commissions); all-time/current month/last month/custom range; click → deduction breakdown popup; hover → deductions total. Per-office bhi same (click office → us office ka profit, hover/click breakdown, period filters).
- F3/F5: FIXED_COMMISSION offices mein case/office expenses commission user se TAB TAK minus na hon jab tak admin expense add karte waqt "commission user ke khatay se minus" option select na kare (flag per expense). PROFIT_SHARE offices ka formula unchanged (case expenses pool se, office expenses per-share).
- F4: printing/attestation dept users ka commission per category + per Set of Attestations grid (user create/edit mein); printing complete → printing commission, attestation complete → attestation commission (case-by-case entries + finance account + payout ke baad remaining).
- F6: filing tab mein files upload ho jane ke baad bhi cases show hon (disappear NAHIN); uploaded vs pending rows ke background colors different; navbar count sirf pending ka.
- F7: filing list ka upload button inline upload khole (detail page pe NA jaye); row ke baqi hisse pe click → detail page.
- F8: har filing case ke neeche doosra button "Verification Sticker/Picture of student" (image/word/pdf) — har woh jagah show ho jahan files show hoti hain.
- F9: PDF in-app view fix + download option.
- F10: case detail page top pe hamesha case name + roll number + category (har tab pe).
- F11: attestation tab mein board attestation number show ho (serializer mein field missing thi).
- F12: category mein "bmfq" ho to new case form mein "Online Verification Number" extra field; har jagah show ho jahan case dekhne ki permission hai.

### Schema (S owns; migration 20261015120000_office_wave21)
- Case.onlineVerificationNumber String?
- CaseExpense.deductFromCommission Boolean @default(false); OfficeExpense.deductFromCommission Boolean @default(false)
- LedgerEntry.adminId String? (+index) — dept commission/payout attribution (memberId null rehta hai)
- DepartmentCommissionRule { adminId, categoryId, setId String @default(""), printAmount Decimal(12,2) @default(0), attestationAmount Decimal(12,2) @default(0), @@unique([adminId, categoryId, setId]) }

### Contracts
- Finance report GET /api/office/finance?from&to&officeId → + offices[].remaining; + profit { received, caseExpenses, officeExpenses, commissions, profitShares, extraShares, salaries, bonuses, deptCommissions, adjustments, deductionsTotal, net } (period-filtered; officeId scoped variant same shape)
- Dept commissions: GET/PUT /api/office/dept-commissions/rules?adminId=; GET /api/office/dept-commissions/summary → [{adminId,name,role,earned,paid,remaining}]; GET /api/office/dept-commissions/entries?adminId= → case-by-case; POST /api/office/dept-commissions/payout {adminId,amount,method,entryDate,remarks}
- Ledger type "DEPT_COMMISSION" (CREDIT) — printing: first PRINTING file → PRINTED transition pe uploader ko rule amount; attestation: case → ATTESTATION_COMPLETE pe acting user ko; idempotent (per case+kind+admin single entry)
- Expenses POST (case + office) accept deductFromCommission; FIXED_COMMISSION + flag → member-tagged EXPENSE DEBIT (case expense → us case ka commission member; office expense → members split by profitPercent fallback equal); list items carry flag
- Cases list filing queue: pending (WAITING_FOR_FILE) + filing-done (has FILING file) union; rows + filingFilesCount, filingDone, onlineVerificationNumber
- Files: stepKey=VERIFICATION_STICKER (department FILING) — workflow transition trigger NAHI karta; files GET items + downloadUrl
- Case detail payload: + onlineVerificationNumber, boardAttestationNumber (always included)

---

## §WAVE 22 — Salary set option, dept commission rates discoverability, dept user finance, dual-perm bridge (2026-10-15)

### F22.1 Salary set option
`BookingOfficeMember.monthlySalary Decimal @default(0) @db.Decimal(12,2)` + migration (idempotent).
Members API (setup/booking-offices/[id]/members POST/PATCH) accepts monthlySalary; GET serializers include it.
Setup members editor: SALARY offices par "Monthly salary" input (jaise PROFIT_SHARE par profitPercent).
Members list mein salary display.

### F22.2 Dept commission rates — dedicated discoverable panel
Setup page par dedicated "Department commission rates" section: tamam users jin ke paas
office:printing:write / office:attestation-dept:write permission ya printing/attestation_dept role hai —
har user ke saath inline commission grid editor (per category + per set, print + attestation amounts).
Existing in-form grid bhi rehti hai.

### F22.3 Dept user ka apna finance view
- summary route: office:ledger:read NA ho magar office:printing:write ya office:attestation-dept:write ho
  → sirf apni row return kare. entries?adminId= bhi adminId===session.adminId par same relaxation.
- Finance page: dept user (no finance/ledger read) → "Mera account" view: Earned / Wasool / Remaining +
  case-by-case entries + payout history (read-only; Pay sirf admin).
- OfficeNav Finance tab dept users ko bhi visible.

### F22.4 Admin status-change bypass → NO commission (verify + document)
cases/[id] PATCH (admin direct status change) kabhi dept commission credit NAHI karta — bypassed steps
ka commission na user ko, na kahin aur, na case expense mein. (Existing behavior; comment + verify.)

### F22.5 Dual-permission auto-bridge
Agar actor ke paas office:printing:write + office:attestation-dept:write DONO hon aur case status
WAITING_FOR_PRINTING ho jab attestation work (ATTESTATION file upload / attestations PATCH /
complete-all) attestation complete karne wala ho → pehle auto PRINTED (isPrinted, printedAt) +
PRINTING commission actor ko, phir ATTESTATION_COMPLETE + ATTESTATION commission actor ko.
Dono credits idempotent (existing remarks-tag mechanism). Sirf dual-perm actor ke liye;
single-perm actor ka purana behavior unchanged.
Call sites: files POST (department=ATTESTATION), attestations PATCH, attestations/complete-all POST.

### F22.6 Dept commission case ke sath attached (read-only display)
Case detail payload +deptCommissions: [{id, kind:"PRINTING"|"ATTESTATION", amount, adminName, entryDate}]
(ledger DEPT_COMMISSION entries of that case). Case ke expenses section mein read-only rows
(chip "Dept commission") — REAL CaseExpense rows NAHI (pool/member formulas unaffected,
admin profit mein double-count nahi — DEPT_COMMISSION bucket already deducts).

---

## WAVE 24 (2026-10-20) — case detail UX + filing files visibility + Mofa Saudi date bug

1. **Filing files sirf Filing section mein**: CaseFilesTab ke PRINTING section ke andar
   "Filing files (print ke liye)" duplicate block tha — HATA diya. Filing files ab sirf
   Filing section mein; view/download permission sab viewers ke paas (read-only mode).
   Dept-limited workers (printing/attestation) ko files GET ab FILING files bhi deta hai
   (read-only) + DeptCaseView mein alag "sirf dekhne ke liye" Filing section.
2. **Case detail page dedup**: CaseHeaderStrip DELETE — wahi info (case #, naam, category,
   status, Board #) CaseCommandBar + CaseStatusHeader mein pehle se thi. Roll/Reg/
   Online-Verification # chips command bar mein merge.
3. **Attestations tab blink fix**: SetPanel ki loadSets dep `detail.category` OBJECT par
   thi — har 15s live-refresh par naya object → effect refire → skeleton flash. Ab
   primitive deps (categoryId/rollNumber) — sirf tab fetch jab waqai change ho.
4. **"Done" label → "Completed at"**: attestation row ka default "Done —" text hata diya;
   "Completed at <date>" sirf tab jab completedDate maujood ho. Date input labels bhi
   Scheduled / Completed at.
5. **Mofa Saudi date bug (ROOT CAUSE)**: live DB ke tamam sets stepKey "MOFA_SAUDI" use
   karte hain, date-engine sirf "MOFA_SAUD" check karta tha — key mismatch se Mofa Saudi
   ki date KABHI generate nahi hoti thi. Engine ab dono keys accept karta hai
   (MOFA_SAUDI preferred). Seed script bhi MOFA_SAUDI par align. 3 affected cases
   (AF-2026-000024/25/27) ki dates regenerate kar di (engine se, existing status/dates
   preserve): 027 → 2026-11-02, 025 → 2026-10-12, 024 → 2026-11-02.

---

## WAVE 25 (2026-10-20) — dept queue identity fields + dept remarks option

1. **Dept queue list mein pehchan**: printing/attestation (aur baqi dept) queue rows mein
   ab client ka NAME (identity block mein, sab depts) + Roll # / Reg # (printing aur
   attestation work cell mein). Slim cross-office payload (serializeFilingCase) ab
   clientName carry karta hai — pehle nahi karta tha.
2. **Dept users ko remarks add option**: root cause — "attestation" office ROLE remarks
   maps mein kahin nahi tha: client `allowedTargetsFor` default [] (composer kabhi render
   nahi hota tha), server `allowedRemarkTargets` [] (POST 403), `roleToRemarkTarget` null
   (dept remarks visible hi nahi hote). Teeno maps mein "attestation" role add:
   target=ATTESTATION, targets=ALL. ROLE_PRESETS.attestation +office:remarks:write
   (future users). ATTESTATION remark notifications ab "attestation" + "attestation_dept"
   dono roles ko jati hain. Live rwp user ke paas permission pehle se maujood thi —
   asal blocker role-mapping thi.

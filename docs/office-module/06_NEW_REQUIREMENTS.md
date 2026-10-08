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
1. `M Tech`
2. `Dip BBTE DAE 3Y`
3. `BBTE DBA 3Y`
4. `BBTE Dip 1-2`
5. `Medical Bmfq`
6. `CPLS`
7. `APAC`

Each category has **sets**; each set is an ordered list of **steps**. Steps and their
meaning (all dates are working-day computed, see N6):

Steps glossary: `Bord` (board attestation; generates Board Attas Number), `UV idcc`,
`QR code idcc`, `Special Moofa` (with city), `Saud MBC` (Islamic/hijri date also shown),
`Moofa Saud` (Saudi working day, dd-mm-yy solar), `Back Nevtcc`, `Current Nevtcc`,
`bmfq ver`, `MoH atta`, `CPLS atta`, `nevtcc`, `APAC atta`.

### M Tech (uses Category-4 formulas)
- (i) Bord + UV idcc + Special Moofa — formulas of set 4(i) for Bord/UV idcc/Special Moofa
- (ii) Bord + QR code idcc + Special Moofa — formulas of set 4(ii)
- (iii) Bord + UV idcc
- (iv) Bord + QR code idcc
- (v) Bord

### Dip BBTE DAE 3Y (= "category 4")
- (i) Bord + UV idcc + Special Moofa + Saud MBC + Moofa Saud
- (ii) Bord + QR code idcc + Special Moofa + Saud MBC + Moofa Saud
- (iii) Bord + UV idcc + Special Moofa
- (iv) Bord + QR code idcc + Special Moofa
- (v) Bord + UV idcc
- (vi) Bord + QR code idcc
- (vii) Bord

R-number (roll number) last-2-digit logic for sets of this category:
- last two digits ∈ {22..29}: set (i)/(v-style full sets) are shown DIMMED (disabled) to
  the record creator.
- last two digits ∈ {19, 20, 21}: Bord + UV idcc dates are in year 2020 / 2021 / 2022
  respectively.
- otherwise (any other suffix incl. 19–21 handled above): Bord date = a random pick from
  the **2019 working-date pool** (admin-editable list of 2019 working dates; system
  collects up to 30 and then uses them randomly; admin can edit/delete entries).
  UV idcc = a working date in the same year, ≥ 3 days after the Bord date (paired and
  recorded with the Bord date).

Board Attas Number (auto-generated when a Bord step date is assigned):
`[last digit of bord-date year][month 2 digits][3-digit global sequential count]`
= 6 digits total. If it would start with `0`, replace that leading `0` with `8`.
Global counter across ALL cases (model `BoardAttasCounter`).

Special Moofa date: first available working day **7 days after the FIRST payment date**
(payment date + 7 → first working day). Must not be a Pakistan holiday; city = Islamabad
unless Islamabad is marked closed that day (holiday/closure table) → then Gujrat, else
Lahore (first open city, priority Islamabad → Gujrat → Lahore). City name stored with date.

Saud MBC date: 2 days after Special Moofa → first available **Islamabad** working day
falling on **Tue/Wed/Thu/Fri** (and Islamabad not marked closed / embassy-closure flag in
holiday table). Hijri (Islamic) date also computed (tabular calendar) and shown.

Moofa Saud date: 4 days after Saud MBC → first **Saudi Arabia working day**
(Saudi weekend = Fri+Sat) falling on **Mon/Tue/Wed** (Sunday removed per owner, 2026-10-08);
stored/displayed as `dd-mm-yy`.

Set (ii) formulas (QR code idcc variant):
- Bord date = first available working day **5 days after first payment date**; must not
  be a Pakistan holiday and **Quetta** must not be marked closed that day.
- QR code idcc = Bord + 2 days → first available **Islamabad** working day.
- Special Moofa = QR idcc + 1 day → first available day among Islamabad/Gujrat/Lahore
  (priority Islamabad first, city stored).
- Saud MBC / Moofa Saud same as set (i).

### BBTE DBA 3Y
Same 7 sets (i–vii) and same formulas as Dip BBTE DAE 3Y.

### BBTE Dip 1-2
- (i) Bord + Back Nevtcc + Special Moofa + Saud MBC + Moofa Saud — formulas of set 4(i)
  with `Back Nevtcc` in place of `UV idcc`.
- (ii) Bord + Current Nevtcc + Special Moofa + Saud MBC + Moofa Saud — formulas of set
  4(ii) with `Current Nevtcc` in place of `QR code idcc`.

### Medical Bmfq
- (i) bmfq ver + MoH atta + Special Moofa: bmfq ver = first payment + 5 days → first
  working day (Pakistan holiday-free, Quetta not closed). MoH atta = bmfq ver + 2 days →
  first Islamabad working day. Special Moofa = MoH atta + 1 day → first available of the
  3 cities (priority Islamabad).
- (ii) bmfq ver + MoH atta (same first two formulas).
- (iii) bmfq ver only.

### CPLS
- (i) CPLS atta + nevtcc + special moofa: CPLS atta = first payment + 3 days → first
  working day (Pakistan holiday-free, Islamabad not closed). nevtcc = CPLS atta + 1 day →
  first Islamabad working day. special moofa = nevtcc + 1 day → 3-city rule.
- (ii) CPLS atta + nevtcc. (iii) CPLS atta only.

### APAC
Same as CPLS with `APAC atta` in place of `CPLS atta`.

## N6. Working-day engine
- Pakistan weekend: Sat+Sun. Saudi weekend: Fri+Sat.
- Admin-editable **Holiday/Closure table**: date, scope (PAKISTAN | ISLAMABAD | QUETTA |
  GUJRAT | LAHORE | EMBASSIES_ISB), reason. Seed with well-known Pakistan public holidays
  2019–2026 (recurring dates like 23 Mar, 14 Aug, 25 Dec, Kashmir Day 5 Feb, Labour Day
  1 May, Defence Day 6 Sep, Iqbal Day 9 Nov, Quaid 25 Dec; Eid ranges marked as
  approximations editable by admin).
- **2019 pool**: table of 2019 working dates (admin can add/edit/delete); system suggests
  dates until 30 exist; random pick when needed. Store the pick + its UV-idcc pair on the
  case attestation step.
- The existing AI working-day helper (`working-day.ts`) stays for expected-printing-date;
  the set engine is deterministic over the holiday tables (AI call optional enhancement).

## N7. Case creation & workflow (booking office roles: partner / mulazam / commission agent)
Create record with: name (optional), category (select), r-number **or** reg-number
(at least one compulsory), remarks (optional), picture of client (optional), contact
number (optional), address (optional).
After creation, open the record to add: **Agreed Amount** (+ optional remarks),
**set selection** from that category's sets, payments.

Statuses (extend existing):
- After first payment marked RECEIVED by cashier/super admin → case becomes visible to
  **filing** department, status `WAITING_FOR_FILE`. Filing sees ONLY: category, r-number,
  reg-number, remarks, picture of client (no payment details).
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
- Atta department: sees set dates; marks each step's status as it completes; optional
  file per step; **after the last step a final file (image/pdf/video) is mandatory** →
  status moves to attestation-complete (`COMPLETED` pending courier info).
- Booking office can also create remarks directly for the atta department.
- Courier: when all set steps complete AND payment clear AND courier number + address
  exist → courier dept sees the case with client name, r-number, reg-number, address,
  courier number; printing + atta files visible **in-app** (viewer, not just download).
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

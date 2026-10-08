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

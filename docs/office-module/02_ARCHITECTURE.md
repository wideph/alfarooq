# 02 — Architecture & Data Model

## 1. Where things live

```
src/
  app/
    office/                      # office UI (client pages, same style as /admin)
      layout.tsx                 # OfficePageFrame: auth + role nav
      page.tsx                   # dashboard (role-aware)
      cases/page.tsx             # case list + filters
      cases/[id]/page.tsx        # case detail: payments, attestations, contacts, ledger
      payments/page.tsx          # cashier queue: pending slips
      ledger/page.tsx            # booking office accounts, payouts
      finance/page.tsx           # super admin: income report
      setup/page.tsx             # super admin: offices, categories, attestation types, commissions, staff
    api/office/
      cases/route.ts                     GET list, POST create
      cases/[id]/route.ts                GET detail, PATCH update, DELETE (super admin)
      cases/[id]/contacts/route.ts       POST, DELETE
      cases/[id]/addresses/route.ts      POST, DELETE
      cases/[id]/attestations/route.ts   POST add, PATCH status/date, DELETE
      cases/[id]/expenses/route.ts       POST, DELETE
      cases/[id]/status/route.ts         PATCH (attestation office / super admin)
      cases/[id]/commission/route.ts     PATCH (cashier/super admin: reduce commission, extra %)
      cases/[id]/remaining/route.ts      PATCH (booking office claim / cashier accept)
      cases/[id]/profit/route.ts         POST finalize profit share (type 2)
      payments/route.ts                  GET list (queue), POST create (booking office)
      payments/[id]/route.ts             PATCH verify/status/date (cashier), DELETE
      payments/[id]/slip/route.ts        GET signed R2 URL for the slip
      ledger/route.ts                    GET entries (filter office/member), POST payout
      salaries/route.ts                  GET, POST, DELETE
      expenses/route.ts                  GET, POST, DELETE (company expenses)
      finance/route.ts                   GET income report (super admin)
      setup/booking-offices/route.ts     CRUD
      setup/booking-offices/[id]/members/route.ts
      setup/booking-offices/[id]/commissions/route.ts
      setup/categories/route.ts          CRUD
      setup/attestation-types/route.ts   CRUD
      working-day/route.ts               POST compute (also used internally)
  components/office/
      OfficePageFrame.tsx, OfficeNav.tsx, CaseForm.tsx, PaymentForm.tsx,
      ExtraAmountPopup.tsx, CaseAttestations.tsx, ContactsAddresses.tsx,
      LedgerTable.tsx, FinanceReport.tsx, SetupPanels.tsx ...
  lib/office/
      permissions.ts     # role → permission presets, office permission constants
      r2.ts              # Cloudflare R2 client (upload, delete, signed GET)
      audit.ts           # logOfficeAction()
      money.ts           # Decimal helpers
      case-numbers.ts    # AF-YYYY-000123 generator
      commission.ts      # type-1 commission credit logic
      profit-share.ts    # type-2 finalize logic
      working-day.ts     # +6 days → first PK working day, AI + cache + fallback
      case-access.ts     # scoping helper: which cases can this session see
      serializers.ts     # Prisma → JSON (Decimal → number)
```

## 2. Auth & roles (extends the existing system, no new tables for users)

`Admin.role` values:

| role | Meaning |
|------|---------|
| `admin` | Super admin (existing). `hasPermission()` already returns true for everything. |
| `sub_admin` | Existing website sub-admin. |
| `cashier` | New. |
| `attestation` | New. |
| `booking_office` | New. Must have `Admin.bookingOfficeId` set. Shareholders of one office are several `booking_office` users with the same `bookingOfficeId`. |

`Admin.permissions` (JSON array) is still the source of truth for what a user can
do. New permission strings (added to `ADMIN_PERMISSIONS` in `src/lib/auth.ts`):

```
office:cases:read        see cases (scoped by role, see §4)
office:cases:write       create/edit cases, contacts, addresses, required attestations
office:payments:submit   create payment with slip (booking office)
office:payments:verify   accept / not received / bogus, edit date, accept remaining
office:attestation:write change print/attestation/case step statuses
office:ledger:read       see office accounts
office:ledger:write      payouts, commission reduce, extra-% decision, profit finalize
office:expenses:write    case expenses, company expenses, salaries
office:finance:read      company income report
office:setup:write       booking offices, members, categories, attestation types, commissions
```

`src/lib/office/permissions.ts` holds `ROLE_PRESETS` so the super admin picks a role
in the UI and the right permission set is stored:

```
cashier:      cases:read, payments:verify, ledger:read, ledger:write, expenses:write
attestation:  cases:read, attestation:write
booking_office: cases:read, cases:write, payments:submit
```

Super admin may still tick extra permissions per user. The website sub-admin panel
(`SubAdminPanel.tsx`) gets: role dropdown, booking-office dropdown (when role =
booking_office), and the office permission checkboxes.

Login stays at `/admin/login`. After login, users whose role is one of the three
office roles are redirected to `/office`; super admin goes to `/admin` as before and
sees an **Office** item in `AdminNav`.

## 3. Storage — Cloudflare R2

`src/lib/office/r2.ts` uses `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`:

- `uploadOfficeFile(file, prefix)` → key `office/<prefix>/<timestamp>_<safe-name>`
- `deleteOfficeFile(key)`
- `getOfficeFileSignedUrl(key, expiresSeconds = 900)`

Only PDF and images, max 10 MB (matches `serverActions.bodySizeLimit`). Slips are
served **only** through `/api/office/payments/[id]/slip`, which checks the session
can see that case and then redirects to a short-lived signed URL. R2 bucket stays
private.

## 4. Case visibility scoping (`case-access.ts`)

| role | Cases visible |
|------|---------------|
| admin, cashier, attestation | all |
| booking_office | `Case.bookingOfficeId === session.bookingOfficeId` |

Every list/detail/mutation route calls `assertCaseAccess(session, caseId)`.

## 5. Data model (Prisma) — all new tables are prefixed with nothing but grouped here

### Admin (edited)
```
bookingOfficeId String?      // FK BookingOffice, only for role booking_office
bookingOffice   BookingOffice? @relation(...)
```

### BookingOffice
```
id, name, type (FIXED_COMMISSION | PROFIT_SHARE | SALARY), phone?, notes?,
isActive, createdAt, updatedAt
members      BookingOfficeMember[]
commissions  BookingOfficeCommission[]
cases        Case[]
ledger       LedgerEntry[]
salaries     SalaryEntry[]
users        Admin[]
```

### BookingOfficeMember  (shareholder / staff record)
```
id, bookingOfficeId, adminId? (login user, unique), name,
profitPercent Decimal(5,2) @default(0)   // type 2 only
isActive, createdAt
```
Type 1 offices normally have one member ("the office") but payouts may also target a
member. Type 3 members are staff for salaries.

### BookingOfficeCommission  (type 1: fixed amount per category)
```
id, bookingOfficeId, categoryId, amount Decimal(12,2)
@@unique([bookingOfficeId, categoryId])
```

### CaseCategory
```
id, name @unique, defaultAmount Decimal(12,2)?, isActive, order
```

### AttestationType
```
id, name @unique, order, isActive
```

### Case
```
id, caseNumber @unique  (AF-2026-000001)
bookingOfficeId, createdByAdminId
categoryId
clientName, rollNumber?, registrationNumber?
agreedAmount   Decimal(12,2)        // total fee agreed with customer
claimedRemaining Decimal(12,2)?     // what booking office says is still due
claimedRemainingStatus  (NONE | PENDING | ACCEPTED)
commissionAmount Decimal(12,2)      // type 1 snapshot from BookingOfficeCommission; editable by cashier/admin
commissionHalfCreditedAt DateTime?  // first half credited
commissionFullCreditedAt DateTime?  // second half credited
extraSharePercent Decimal(5,2)?     // decided in popup, null = not decided yet
extraShareCreditedAt DateTime?
profitFinalizedAt DateTime?         // type 2
status  (NEW | PAYMENT_PENDING | IN_PROCESS | PRINTED | ATTESTATION | COMPLETED | DELIVERED | CANCELLED)
isPrinted Boolean, printedAt DateTime?
expectedPrintingDate DateTime?
notes String?
createdAt, updatedAt
contacts CaseContact[], addresses CaseAddress[], attestations CaseAttestation[],
payments Payment[], expenses CaseExpense[], ledger LedgerEntry[]
@@index([bookingOfficeId, status]), @@index([status]), @@index([createdAt])
```

### CaseContact  `id, caseId, phone, label?, createdAt`
### CaseAddress  `id, caseId, address, label?, createdAt`

### CaseAttestation
```
id, caseId, attestationTypeId, status (PENDING | IN_PROGRESS | DONE),
scheduledDate?, completedDate?, notes?, order
@@unique([caseId, attestationTypeId])
```

### Payment
```
id, caseId, amount Decimal(12,2), paymentDate DateTime
method (CASH | BANK | EASYPAISA | JAZZCASH | OTHER), reference?
slipKey?  (R2 object key), slipType? (pdf|image)
status (PENDING | RECEIVED | NOT_RECEIVED | BOGUS)
submittedById, verifiedById?, verifiedAt?, remarks?
createdAt, updatedAt
@@index([caseId]), @@index([status])
```
"First payment" = the earliest RECEIVED payment of the case. "Final payment" =
a RECEIVED payment after which `sum(RECEIVED) >= agreedAmount`.

### CaseExpense  `id, caseId, amount, description, expenseDate, createdById, createdAt`

### LedgerEntry  (booking office / shareholder account)
```
id, bookingOfficeId, memberId?, caseId?, paymentId?
type (COMMISSION_HALF | COMMISSION_FINAL | COMMISSION_ADJUST | EXTRA_SHARE |
      PROFIT_SHARE | PAYOUT | ADJUSTMENT)
direction (CREDIT | DEBIT)
amount Decimal(12,2)      // always positive; direction says sign
entryDate DateTime
method?  (for PAYOUT: CASH | BANK | EASYPAISA | ...)
remarks?, createdById, createdAt
@@index([bookingOfficeId, entryDate]), @@index([caseId])
```
Balance of an office/member = Σ CREDIT − Σ DEBIT.

### SalaryEntry  `id, bookingOfficeId, memberId?, amount, periodMonth (YYYY-MM), paidDate?, remarks?, createdById, createdAt`

### CompanyExpense  `id, amount, description, category?, expenseDate, createdById, createdAt`

### WorkingDayCache
```
id, candidateDate DateTime @unique (date only, UTC midnight)
workingDate DateTime            // resolved first working day ≥ candidate
isCandidateWorking Boolean
reason String?                  // "Saturday", "Eid ul Adha", ...
source (AI | FALLBACK | MANUAL)
createdAt
```

### OfficeAuditLog
```
id, actorId, actorRole, action, entity, entityId, before Json?, after Json?, createdAt
@@index([entity, entityId]), @@index([createdAt])
```

## 6. Case status meaning

| status | set by |
|--------|--------|
| NEW | on create |
| PAYMENT_PENDING | a payment slip submitted, none accepted yet |
| IN_PROCESS | first payment accepted (auto) |
| PRINTED | attestation office marks printed (auto sets `isPrinted`, `printedAt`) |
| ATTESTATION | attestation office moved any attestation to IN_PROGRESS |
| COMPLETED | all required attestations DONE |
| DELIVERED | attestation office / super admin |
| CANCELLED | super admin |

Manual override of status is allowed for attestation office and super admin via
`PATCH /api/office/cases/[id]/status`; automatic transitions only move forward.

## 7. Migration strategy

One migration `prisma/migrations/20261001120000_office_module/migration.sql`
creating all tables/columns above with `IF NOT EXISTS` guards and FK constraints in
a `DO $$` block (same pattern as `20260627120000_tracking_bot_permissions`). Enums are
stored as `TEXT` with app-level validation (matches the existing codebase; no PG
enums).

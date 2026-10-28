# 03 — Business Rules (implement exactly like this)

All money is `Decimal(12,2)`. Use `src/lib/office/money.ts` helpers.

## BR1. Payment lifecycle

1. Booking office (`office:payments:submit`) creates a `Payment` with amount,
   paymentDate, method, optional reference, **slip file** (R2). Status = `PENDING`.
   Case status becomes `PAYMENT_PENDING` if it was `NEW`.
2. Cashier / super admin (`office:payments:verify`) opens the slip and sets status to
   `RECEIVED`, `NOT_RECEIVED` or `BOGUS`. They may also edit `paymentDate` and
   `amount` (amount edit is logged). `verifiedById`, `verifiedAt` are set.
3. Only `RECEIVED` payments count anywhere (remaining, commission, income).
4. Received total: `received = Σ Payment.amount where status = RECEIVED`.
   Remaining: `remaining = max(agreedAmount − received, 0)`.
   Extra: `extra = max(received − agreedAmount, 0)`.
5. A payment can be changed back (e.g. RECEIVED → BOGUS). When that happens run
   `recomputeCaseFinancials(caseId)` (see BR3.5) so credits are reversed with
   `COMMISSION_ADJUST` entries. Never delete ledger rows; always add reversing rows.

## BR2. Remaining amount claimed by booking office

- Booking office sets `claimedRemaining` (status `PENDING`).
- Cashier/super admin **accept**: `agreedAmount = received + claimedRemaining`,
  status `ACCEPTED`. Or **edit**: they enter a different remaining, which is applied
  the same way, status `ACCEPTED`.
- Changing `agreedAmount` re-runs BR3.5.

## BR3. Type 1 — FIXED_COMMISSION office

3.1 On case create: `commissionAmount = BookingOfficeCommission[office, category].amount`
    (0 if not configured; show a warning in UI).
3.1a §W45: case us office ka member khud banaye → upar wala poora commission usi
    member ke account mein (pehle jaisa). Admin / cashier (office ka member nahi)
    banaye aur grid commission > 0 ho → admin se faisla: **poora / nahi / partial**
    (partial: 0 < raqam < grid) aur office mein ek se zyada active member hon to
    kis member ke account mein (akela member khud chun liya jata hai). Faisla
    `Case.commissionMode` (FULL / NONE / PARTIAL) + `Case.commissionMemberId`.
    Commission / extra share / commission-discount ki ledger rows isi member par.
    "Nahi" / "Partial" wale case par category badle to commission grid ke saath
    nahi badalti (admin ka faisla qaim); baad mein 3.2 se badli ja sakti hai.
3.2 Cashier/super admin may **reduce** `commissionAmount` any time
    (`PATCH /commission`). Reason required (remarks). Cannot go below 0.
3.3 **Half credit**: when the case has ≥ 1 RECEIVED payment and
    `commissionHalfCreditedAt` is null → create `LedgerEntry`
    `COMMISSION_HALF CREDIT amount = commissionAmount / 2` (round half up to 2 dp),
    set `commissionHalfCreditedAt`.
3.4 **Final credit**: when `agreedAmount > 0` and `received >= agreedAmount` and
    `commissionFullCreditedAt` is null → create `COMMISSION_FINAL CREDIT amount =
    commissionAmount − already credited commission` (so the total equals
    `commissionAmount` exactly), set `commissionFullCreditedAt`.
    If `agreedAmount` is still 0 (booking office did not set the fee yet) only the
    half credit happens until the fee is set.
3.5 **Recompute** (`recomputeCaseFinancials`): target credited commission =
    - 0 if no RECEIVED payment,
    - `commissionAmount / 2` if received > 0 but `< agreedAmount`,
    - `commissionAmount` if received ≥ agreedAmount.
    Compare with Σ of existing COMMISSION_* credits − adjust debits for the case;
    if different, insert one `COMMISSION_ADJUST` (CREDIT or DEBIT) for the
    difference. This single function also implements 3.3/3.4 (call it after every
    payment verification, commission change, agreedAmount change).
3.6 **Extra amount**: when `extra > 0` and `extraSharePercent` is null, the API
    response for the payment verification returns `needsExtraDecision: { extra }`.
    UI shows the **pop-up**: "Is case mein Rs X zyada receive hui hai. Booking office
    ko kitne % jaye?" with buttons 100 % / 50 % / custom. Cashier submits
    `PATCH /commission { extraSharePercent }` → create `EXTRA_SHARE CREDIT amount =
    extra × percent / 100`, set `extraShareCreditedAt`. If `extra` later changes
    (payment reversed / new extra), recompute the target extra share the same way as
    3.5 and adjust with additional `EXTRA_SHARE` CREDIT/DEBIT rows (remarks
    "adjust"), so commission rows and extra-share rows stay separable. The case
    detail page also shows the pending decision banner until it is made.
3.7 **Payouts**: `POST /ledger { bookingOfficeId, memberId?, amount, entryDate,
    method, remarks }` → `PAYOUT DEBIT`. Balance may go negative (advance); UI shows
    it in red.

## BR4. Type 2 — PROFIT_SHARE office

4.1 No commission entries during payments. `commissionAmount` stays 0.
4.2 Profit of a case = `received − Σ CaseExpense.amount − Σ DEPT_COMMISSION (is case
    par)` (§W40; 0 par clamp nahi). Office level (owner ka formula): **Profit =
    received − office expenses − case expenses − department expenses − other
    expenses**; member = profit × apni %, admin = baqi (100 − members %). Office
    expenses har member ke account se EXPENSE debit (us ki %) ki shakal mein — natija
    wahi. Har paisay wale badlaav (payment create / status / amount / delete, case
    expense, department commission) ke baad `syncProfitShare` (ADJUSTMENT rows).
4.3 **Finalize** (`POST /cases/[id]/profit`, `office:ledger:write`): allowed when
    `received > 0`. For each active member with `profitPercent > 0`: create
    `PROFIT_SHARE CREDIT amount = profit × profitPercent / 100` (memberId set). Set
    `profitFinalizedAt`.
4.4 **Re-finalize** (payments or expenses changed after finalize): compute the new
    target per member; insert `ADJUSTMENT` CREDIT/DEBIT per member for the
    difference. UI shows "Profit share dobara calculate karein" button when
    `updatedAt` of payments/expenses > `profitFinalizedAt`.
4.5 Under/over payment does not matter — percentage of actual profit.
4.6 Payouts as in 3.7.

## BR5. Type 3 — SALARY office

5.1 No ledger credits. Payouts not applicable.
5.2 `SalaryEntry` per member per month (`office:expenses:write`). Counted as company
    expense in the month of `periodMonth` (or `paidDate` if set — use `paidDate`
    when present, else the 1st of `periodMonth`).

## BR6. Company income report (super admin, `office:finance:read`)

For a date range `[from, to]` (inclusive, Pakistan time, dates only):

```
income      = Σ Payment.amount        (status RECEIVED, paymentDate in range)
commissions = Σ LedgerEntry CREDIT − Σ LedgerEntry DEBIT-of-type ADJUSTMENT/COMMISSION_ADJUST
              for types COMMISSION_*, EXTRA_SHARE, PROFIT_SHARE, ADJUSTMENT   (entryDate in range)
              (PAYOUT is NOT an expense — it settles an already-counted liability)
caseExpenses= Σ CaseExpense.amount     (expenseDate in range)
salaries    = Σ SalaryEntry.amount     (effective date in range, BR5.2)
otherExp    = Σ CompanyExpense.amount  (expenseDate in range)
profit      = income − commissions − caseExpenses − salaries − otherExp
```

Presets: today, this week (Mon–Sun), this month, custom. Also return a per-day
series for the chart/table, and a per-office breakdown of `commissions`.

Also show **liabilities**: Σ balance of all offices/members (credits − payouts) —
money owed but not yet paid out.

## BR7. Expected printing date (AI + cache)

7.1 Trigger: whenever a payment becomes `RECEIVED` and the case has no
    `expectedPrintingDate` yet, **or** the earliest RECEIVED payment's date changed.
    Base date = **earliest RECEIVED payment's paymentDate** (Pakistan date).
7.2 `candidate = base + 6 days`. Result = first working day in Pakistan with
    `date >= candidate`.
7.3 `getPakistanWorkingDay(candidate)` in `src/lib/office/working-day.ts`:
    1. Look up `WorkingDayCache` by `candidateDate` → return if found.
    2. Else ask the AI already configured in `SiteSettings` (`callBotJson` from
       `src/lib/bot-ai.ts`, provider-agnostic) with a strict JSON prompt:
       ```
       system: You are a Pakistan public-holiday and working-day expert. Working days
       are Monday–Friday excluding Pakistani national/public holidays (Eid ul Fitr,
       Eid ul Adha, Ashura 9-10 Muharram, Eid Milad un Nabi, Kashmir Day 5 Feb,
       Pakistan Day 23 Mar, Labour Day 1 May, Independence Day 14 Aug, Iqbal Day 9 Nov,
       Quaid Day 25 Dec, and government-announced holidays). Answer JSON only.
       user: Candidate date: YYYY-MM-DD (weekday). Is it a working day in Pakistan?
       If not, what is the first working day on or after it? Return
       {"isWorkingDay":bool,"workingDate":"YYYY-MM-DD","reason":"..."}
       ```
       Prefill key `{"isWorkingDay"`. Timeout `BOT_QUICK_TIMEOUT_MS`. Validate:
       `workingDate >= candidate`, ≤ candidate + 14 days, not Sat/Sun; otherwise
       treat as failure.
    3. On failure/disabled AI: fallback = skip Saturday/Sunday only, `source =
       FALLBACK`. Store in cache either way (so the super admin can later correct
       it).
    4. Super admin can override a cache row (`source = MANUAL`) from `/office/setup`
       → "Working days"; overriding re-computes `expectedPrintingDate` for open
       cases whose candidate equals that date.
7.4 Store `Case.expectedPrintingDate` (date only). Show it on every case list/detail
    for every role.

## BR8. Case numbering

`AF-<YYYY>-<6 digits>` sequential per year, generated inside a transaction with
`SELECT ... FOR UPDATE` on a `CaseCounter(year, last)` row → add this small table in
the migration.

## BR9. Audit

Every mutating office API writes `OfficeAuditLog` (actor, action, entity, id, before,
after). Case detail page shows the last 20 audit rows to super admin.

## BR10. Department commissions (printing / attestation / courier) — §W30

- §W31 simple form per dept user: PRINTING = one amount per case category
  (`DepartmentCommissionRule` category row `printAmount`); ATTESTATION = one
  amount per Set of Attestations (set row `attestationAmount`; a case without a
  set uses the category row `attestationAmount`); COURIER = one amount for every
  delivered case (`DepartmentCommissionSetting.courierAmount`). Empty or 0 →
  commission 0.
- Credit (one `DEPT_COMMISSION` ledger CREDIT per case + kind + user, idempotent)
  happens at the event, with the rule amount **at that moment**:
  - PRINTING — the user's first printing proof moves the case to PRINTED.
  - ATTESTATION — the user's action completes the attestation stage.
  - COURIER — the user's courier slip moves the case to DELIVERED.
- Changing a rate affects only later events; already credited cases never change.
- Admin status-dropdown jumps credit nobody.

## BR11. Courier stage (automatic, forward-only) — §W30

- After ATTESTATION_COMPLETE ("final payment pending"): when
  `remaining = max(agreed − RECEIVED, 0) = 0` (agreed > 0) the case moves to
  `WAITING_FOR_COURIER_ADDRESS` if it has no delivery address, else straight to
  `WAITING_FOR_COURIER` ("waiting for courier slip"). Adding an address moves the
  address stage to the slip stage. Checked after payments, agreed-amount changes
  (remaining accept, discount, case edit), address add, attestation completion
  and admin setting ATTESTATION_COMPLETE.
- A courier slip upload (courier permission) in either courier stage → DELIVERED.
- §W32: a user with ANY of printing / attestation-department / courier permission
  (not super admin) may complete the attestation stage without the FINAL attestation
  file once the case has a printing proof — a written reason is mandatory (audit log
  + a remark to ADMIN). File uploads and step changes still need the FINAL file.
- §W32: a case with NO Set of Attestations and no pending attestation steps goes
  straight to ATTESTATION_COMPLETE with its first printing proof (then the courier
  rule above). A no-set case whose attestations were chosen individually follows the
  normal attestation flow.
- §W32: for a case with NO Set of Attestations, every attestation chosen (at case
  creation or added later) gets scheduledDate = first Pakistan working day AFTER the
  selection date (AI working-day engine, holiday/weekend fallback). Set cases keep the
  set date engine.

## BR12. Remarks tab — §W32

Every user sees, in the "Remarks" nav tab, all case remarks addressed to their
targets (role target + every department write permission: FILING / PRINTING /
ATTESTATION / COURIER; booking office = BOOKING on own-office cases; super admin =
ADMIN), except their own, until THEY press "Done" (per user, `CaseRemarkDone`).
Seeing a remark does not remove it.

## BR13. Cases tab — queue counts + unread — §W35

- Cases page par har queue ke upar us ke TAMAM cases ki tadad: status queues
  (1st payment pending … Final payment pending (ATTESTATION_COMPLETE), Waiting for
  address, Waiting for delivery (WAITING_FOR_COURIER), Delivered, Musadiqa stages,
  Cancelled, aur "Open") aur department queues (deptQueueWhere ke mutabiq — filing
  queue mein done filing rows bhi, courier queue mein delivered bhi). Scope wahi jo
  list ka (caseScope + office filter; dept queue permission par tamam offices).
- Super admin (role admin) ke liye per-case "Read": navbar Cases tab par unread
  cases ki tadad. Read = `CaseRead` row jis ka status case ke maujooda status ke
  barabar ho. Naya case = unread; case doosri queue (status) mein jaye = phir
  unread. Har row par "Read", upar "Read all". Read wahi status save karta hai
  jo user ne dekha (beech mein queue badli ho to case unread hi rehta hai).

## BR14. Department worker ko raqam nahi — §W36

"Department worker" = printing / attestation / courier ka kaam (dept write
permission ya attestation office), aur paison wali koi permission nahi (cases
edit, payments, ledger, finance, expenses; cashier / booking office / admin /
filing is mein nahi) — `isDeptWorkerAccess` (permissions.ts).
- Kisi case ki agreed / received / remaining / commission / extra / payments /
  expenses / ledger na API se (detail + list payload neutral 0 / khali), na UI
  mein; sirf status. Payments list, case discount requests, bonus requests
  GET → 403. Dept commissions mein sirf apni rows. Contacts / delivery
  addresses sirf courier permission par.
- Case detail page tabs ki bajaye ek hi page (sections): Client info
  (+ contacts / addresses courier ke liye), Set + Steps & dates, Files,
  Remarks, aur "Is case par aap ka commission". Payments tab aur History /
  Finance ki baqi cheezein nahi.

## BR15. PRINTED sirf proof ya admin se — §W39

Case PRINTED (isPrinted) sirf do tareeqon se: printing department ka printed proof
upload, ya admin ka status change. F22.5 ka "dual-permission auto-bridge" (printing +
attestation wala user WAITING_FOR_PRINTING case par attestation kaam kare to khud
PRINTED) hata diya. Printing se pehle ke statuses (FIRST_PAYMENT_PENDING /
WAITING_FOR_FILE / WAITING_FOR_PRINTING) par department user ka attestation kaam
(step IN_PROGRESS, attestation file, complete-all) case ko aage nahi le jata;
complete-all 400. Admin ke ikhtiyar pehle jaise.

§W40: admin ke status change par kisi department ko commission nahi. Case ki aakhri
PRINTING file delete ho to us case ka PRINTING commission khatam aur case PRINTED ho
to wapas WAITING_FOR_PRINTING (dobara asal proof par commission phir milta hai).

## BR16. Office balance, bonus aur discount — §W45

- Office balance ("Company owes office") aur office ka statement = sirf office /
  members ki ledger rows. Department users ki rows (adminId — DEPT_COMMISSION aur
  un ke payouts) office ke case par likhi hoti hain magar office ka paisa nahi; wo
  Finance → departments mein hain. Isliye office balance = members ke balance ka total.
- Bonus accept → BONUS CREDIT member ke account mein: request karne wala member,
  warna case ka commission member (3.1a), warna office ka akela active member.
- Discount: "commission se" / "partial" sirf FIXED_COMMISSION office ke case par.
  Commission wala hissa DISCOUNT DEBIT usi member par jis ke account mein case ki
  commission jati hai — member ki earning / due se minus; company finance mein
  commission ka net utna kam (profit utna zyada). Partner / salary office mein
  sirf "profit se" (partner office ka share received kam hone se khud % ke mutabiq
  kam ho jata hai).
- Dashboard "pending" = sirf non-CANCELLED cases ka baqi (Finance remaining jaisa).

## BR17. Courier queue mein address — §W46

- Courier queue (WAITING_FOR_COURIER + DELIVERED) ki har row: case # ke saath student
  ka naam aur Roll / Reg, aur pehle delivery address ki EK line (aur address hon to
  "+N"). Lamba address "poora" dikhata hai; address par click → poore address ka
  view (case #, student, Roll #, Reg #, category, office, har address label ke saath
  + Copy, Case detail). Address click se case page nahi khulta; row ka baqi hissa
  pehle jaisa case page kholta hai.
- Addresses sirf courier queue ki API rows mein: admin / cashier / booking (apna
  office) ko, aur department worker ko sirf courier permission ke saath (detail
  payload jaisa). Raqam pehle ki tarah kabhi nahi.

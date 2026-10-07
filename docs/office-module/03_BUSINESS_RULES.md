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
4.2 Profit of a case = `received − Σ CaseExpense.amount`.
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

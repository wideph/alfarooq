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
7.3a §W60: 7.3 ka AI / cache flow ab nahi — din ka faisla BR28 (`DayResolver`: weekend + admin
     table + built-in chhuttiyan + AI ke band din; admin MANUAL override jeet ta hai). Koi andaza
     cache nahi hota (FALLBACK rows migration wave60 ne delete kin).
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

- §W47: courier queue ke do alag pages — "Waiting for courier slip"
  (WAITING_FOR_COURIER, tab khulte hi yahi) aur "Delivered" (DELIVERED,
  `history=1`). Queue chip / navbar badge = waiting count; Delivered ka count
  apne tab par. Delivered rows par "Case dekhein" (slip upload nahi).
- §W48: courier permission wala user list se hi slip upload karta hai (detail page
  nahi): button → tasveer / PDF chunein → preview (crop, rotate). Kai slips chuni ja
  sakti hain magar EK upload mein sirf ek jati hai — izafi preview mein (X) delete
  karna lazmi, warna upload band. Doosri slip ke liye dobara "Aur slip add karein"
  (Delivered page par bhi). Slip WAITING_FOR_COURIER(_ADDRESS) case ko DELIVERED
  karti hai (pehle jaisa).
- Courier queue ki har row: case # ke saath student
  ka naam aur Roll / Reg, aur pehle delivery address ki EK line (aur address hon to
  "+N"). Lamba address "poora" dikhata hai; address par click → poore address ka
  view (case #, student, Roll #, Reg #, category, office, har address label ke saath
  + Copy, Case detail). Address click se case page nahi khulta; row ka baqi hissa
  pehle jaisa case page kholta hai.
- Addresses sirf courier queue ki API rows mein: admin / cashier / booking (apna
  office) ko, aur department worker ko sirf courier permission ke saath (detail
  payload jaisa). Raqam pehle ki tarah kabhi nahi.

## BR18. Har cheez ek jagah (duplicate UI nahi) — §W47

- Files tab: har department ki files SIRF apne section mein. Courier section mein
  sirf courier slip (printing / attestation files ka doosra block nahi) — har user
  ke liye (booking, admin, department).
- Department commissions card sirf History / Finance tab mein; jumla office type
  ke mutabiq (partner: case ke profit se minus, shareholders apne % se; fixed /
  salary: company deti hai). "Office account entries" mein DEPT_COMMISSION rows
  nahi (office ka paisa nahi).
- Money summary ka Commission tile sirf FIXED_COMMISSION office par.
- Department worker ke single page par attestation complete ka ek hi button (Files
  section — FINAL file ho to wajah optional).
- Remarks tab khula ho to upar wali "new remarks" patti nahi (card ke andar hai).
- Wahi remark (same user + case + text) 2 minute ke andar dobara aaye to naya nahi
  banta.
- §W49: cases page par "All cases / Filing / Printing / Attestation / Courier queue"
  chips sirf super admin ko (AdminNav mein dept tabs nahi); office users ke navbar
  (OfficeNav) mein yehi tabs pehle se hain. Dept tab mein heading usi department ka
  naam. Printing aur courier pages ki rows par status chip nahi (page ka naam hi
  status hai); filing / attestation mein chip rehta hai (status farq batata hai).
- §W50: courier slip (COURIER file) case detail payload mein `courierSlips` (sirf
  COURIER rows — FILING kabhi nahi; wahi /files/<id> links) → Overview mein sab se
  upar "Courier slip" card (admin / booking office / cashier); dept worker ke
  ek-page view mein nahi (Files section saath hai). Slip upload par case banane
  wale + us booking office ke tamam active booking_office users ko notification
  (`notifyCaseOffice`); pehli slip "Delivered — courier slip upload ho gayi",
  baad wali "nayi courier slip upload hui". Case detail tabs mobile par 3x2 grid.

## BR19. Department kharche, wapsi aur expense rule — §W51

- **Courier kharcha**: courier permission wala user courier queue ki list mein har
  row par "Courier slip upload karein" ke neeche amount likh kar "Add" (row par apna
  ab tak ka total "Courier kharcha Rs X ✓") ya case page ke "Courier kharcha (aap ka)"
  card se amount daalta hai (slip preview mein amount ka khana nahi — ek hi jagah) → us case ka `CaseExpense` (kind COURIER, `paidByAdminId` = user;
  super admin khud daale to null — company ka kharcha, wapsi nahi). Ye case expense
  har formula mein pehle jaisa: partner office pool (received − case expenses − dept
  commission) → har shareholder apne % se, admin baqi %; commission office ka rule
  (neeche); admin profit (`caseExpenses` bucket).
- **Other kharcha**: printing / attestation / courier user Finance → Mera account se
  (amount + date + comment LAZMI) → `CompanyExpense` (category DEPT_OTHER,
  `paidByAdminId`). Kisi case / office se nahi — sirf admin ke profit se minus
  (`companyExpenses`). Super admin ke liye ye option nahi.
- Kharche ka hisaab per user: kul − accept ho chuki wapsi = **"Admin se wasooli
  baqi"** (courier aur other alag). User apna kharcha 24 ghante tak khud hata sakta
  hai; baad mein sirf `office:expenses:write`. Case delete ho to user ka diya courier
  kharcha Other kharcha ban kar rehta hai (wasooli zaya nahi).
- **Payment request** (`DeptPayoutRequest`, `office:ledger:write`): kind COMMISSION /
  COURIER_EXPENSE / OTHER_EXPENSE — teeno alag Pay. PENDING request user ko notify;
  user "Mil gaya" (accept) kare tab paid. COMMISSION accept par wahi PAYOUT DEBIT
  ledger row (adminId) jo pehle direct payout likhta tha (earned / paid / remaining
  pehle jaisa); kharchon ki wapsi ledger mein nahi (expense pehle hi profit se minus —
  wapsi sirf qarz ada karti hai, profit par asar nahi). Kharchon ki request baqi −
  pending se zyada nahi; commission par pehle jaisa had nahi. User "Nahi mila" ya
  admin / cashier "Cancel" → REJECTED. Purana direct dept payout route hata diya.
- **Commission office expense rule**: `BookingOffice.expenseDeductPercent` (default
  0 = koi expense commission se nahi katta), Setup → office → "Expenses commission
  se minus". Case bante waqt `Case.expenseDeductPercent` mein likha jata hai — rule
  (aur commission grid) badalne se sirf NAYE cases par asar. Har case expense (admin
  ka, courier ka — sab) par admin (super) case page (History / Finance → Case
  expenses) se apna % rakh sakta hai (`CaseExpense.commissionDeductPercent`, null =
  case ka rule). Minus hissa = amount × % ÷ 100 → EXPENSE DEBIT case ke commission
  member par (§W45 `caseCommissionMemberId`), remarks `Commission expense [<id>]:`
  (finance isi se member-borne hissa admin profit se alag karta hai). Case ki
  commission kisi member par na ho to kuch nahi katta (admin ko 400). Purana W21
  `deductFromCommission: true` = 100%. Partner / salary office par ye rule nahi.
- Admin Finance: KPI "Payable expenses" (tamam users ka courier + other baqi),
  "Department kharche" section (Pay courier / Pay other / Details) + pending
  department payment requests (Cancel). Cashier view mein bhi.

## BR20. Department kharche pehle admin ke review mein — §W52

- Courier / printing / attestation user ka har naya kharcha (courier: list ya case
  page se, kisi case par; Other: Mera account se, comment lazmi) pehle
  `DeptExpenseRequest` PENDING banta hai. Is dauran system ke KISI hisaab mein nahi:
  na case expense, na partner shares / commission rule, na admin profit, na user ki
  "Admin se wasooli baqi", na payment request ki had.
- Super admin (sirf role admin) Payments tab → "Department kharche" (badge = review
  baqi; navbar Payments badge = pending payments + review baqi) mein har kharcha
  dekhta hai: kis ne, kis case par (student, Roll / Reg, office), comment, tareekh,
  aur "Manzoor karne par" kya hoga. Raqam theek kar ke **Manzoor** (asal raqam
  `requestedAmount` mein yaad) ya **Wapas** (wajah user ko). Teen hisse: Review baqi
  (purane pehle) / Manzoor shuda / Wapas kiye.
- Manzoori (`acceptDeptExpenseRequest`, ek transaction) par BR19 wala nizam: COURIER →
  us case ka CaseExpense (kind COURIER, paidByAdminId = createdById = user) + commission
  office ka rule, phir partner pool (syncProfitShare); OTHER → CompanyExpense
  (DEPT_OTHER). Case review ke dauran delete ho gaya ho → Other kharcha.
- User apna review wala kharcha khud wapas le sakta hai (cancel); manzoor kharcha
  sirf admin / cashier (`office:expenses:write`) hata sakta hai (pehle ka 24 ghante
  wala self-delete khatam). Super admin ka apna courier kharcha seedha lagta hai
  (review nahi). Notifications: naya kharcha → super admins; faisla → user.
- Courier list row: "Rs X manzoor" (user ka manzoor shuda, `myCourierExpense`) aur
  "Rs Y review mein" (`myCourierPending`) — sirf user ka apna.

## BR21. Mera account ki tarteeb + "Other expenses" naam — §W53

- Department user ke "Other kharcha" ka naam har jagah **"Other expenses"** (add form
  "New other expenses"; admin Finance / review / payment request labels bhi).
- Mera account (department user) ki tarteeb: (1) teen hisaab lines — Commission, phir
  Courier kharcha, phir Other expenses (kul / wapas mila / admin se wasooli baqi; review
  wali raqam line par note). Admin jis qism ki payment bheje, us ki request ("Mil gaya"
  / "Nahi mila") USI line ke foran neeche. (2) Commission detail, phir Courier kharcha
  detail (review mein + manzoor shuda), phir Other expenses detail. (3) Baqi: New other
  expenses form, Payment history (commission wasool + kharchon ki wapsi / wapas ki gayi).
  Hisaab / API mein koi tabdeeli nahi.

## BR22. Kharchon ki advance wapsi + case delete par admin ka faisla — §W54

- **Advance**: admin department user ko courier kharcha / other expenses ki wapsi
  baqi se zyada bhi bhej sakta hai (commission jaisa) — accept par us qism ka
  "Admin se wasooli baqi" minus ("Advance mila (minus)", red); agle kharche us mein
  barabar hote hain. Admin Finance → Department kharche: har department user ki row
  (kharcha na ho tab bhi), baqi 0 / minus par button "Advance"; Pay modal baqi se
  zyada par amber "Advance: Rs X…". KPI "Payable expenses" = sirf musbat baqi ka
  total; advance hint mein alag.
- **Case delete** (BR19 ka "khud Other ban jata hai" khatam): case par manzoor shuda
  department kharcha (CaseExpense.paidByAdminId) ho to delete 409
  `needsDeptExpenseDecision` → dialog mein teen options, `?deptExpenses=`:
  - **OTHER** — Other expenses (CompanyExpense DEPT_OTHER): sirf admin ka; user ki
    wapsi baqi.
  - **OFFICE** — "Usi office par rahe": OfficeExpense (paidByAdminId = user) usi
    booking office par; partner office → har member ke % (case snapshot, warna abhi
    ke active %) ka EXPENSE DEBIT `Office expense share [id]`; commission office →
    jitna case par commission se minus tha utna hi usi member par `Commission expense
    share [id]` (flag on); salary → koi member row nahi. User ki wapsi baqi (courier
    hisaab mein). Hatana Finance → Office expenses se.
  - **REVERSE** — kharcha khatam, wapsi ka haq khatam; wapsi pehle di ho to user ka
    courier hisaab minus.
  Review mein pade kharche is faisle mein nahi (Payments → Department kharche mein;
  manzoori par Other expenses). Faisla audit: entity "CaseDelete".

## BR23. Bykea kharcha — §W55

- Courier permission wala user courier tab ki list mein har case par slip button ke
  neeche do lines: **Courier amount + Add** aur **Bykea amount + Add** (case page ke
  "Courier / Bykea kharcha" card mein bhi Courier / Bykea chun kar).
- Bykea kharcha bhi pehle admin ke review mein (DeptExpenseRequest kind BYKEA);
  manzoori par us case ka CaseExpense (kind BYKEA, paidByAdminId = user) — booking
  office ke users par bilkul courier / case expense wala formula (partner pool % ke
  mutabiq, commission office ka rule, admin profit).
- Farq sirf user ki wapsi mein: Bykea kharcha courier department user ke **"Other
  expenses"** hisaab mein (Mera account line + detail list case number ke saath; payment
  request OTHER_EXPENSE), courier wala "Courier kharcha" mein. Case delete par "usi
  office par rahe" wala OfficeExpense `kind` yaad rakhta hai (BYKEA → Other expenses).

## BR24. Filing tabs, dobara-kaam commission, extra services, extra ke tukre — §W56

- **Filing queue** do tabs: "Pending for file" (sirf WAITING_FOR_FILE — naye + reissue
  wale; navbar / chip ginti isi ki) aur "Filing complete" (history=1, filing se aage).
  Print ho chuka case pending tab mein nahi rehta. Reissue par `Case.filingRoundAt` —
  us ke baad wali pehli filing file case ko printing par bhejti hai.
- **Dobara kaam ka department commission** (admin status wapas + "Haan" §W44, reissue,
  extra service attestation): `Case.deptCommissionChargeFrom` — us credit number se
  har commission ka CaseExpense (kind DEPT_COMMISSION, deptLedgerEntryId) bhi: case
  expenses mein nazar; commission office mein case ke rule / admin % se member par
  minus. Partner pool aur finance mein sirf DEPT_COMMISSION ledger row ginti (mirror
  exclude — double nahi); finance member-se-minus hissa deptCommissions se ghatata hai.
  Mirror alag se delete nahi; printing file delete (removeDeptCommission) par saath hatta.
- **Booking office edit**: "payment ke baad agreed nahi badal sakte" sirf tab jab agreed
  waqai badle (pehle naam / tasveer badalne par bhi aata tha). Edit form ASAL agreed
  dikhata hai; server services jodta hai.
- **Extra service** (`CaseService`, `lib/office/case-services.ts`): booking office (cases:
  write, apna case) / admin — ek booking, kai hissay, ek amount → `agreedAmount +=`,
  `extraServicesAmount +=`. Hissay: Document reissue (filing ke liye remarks LAZMI,
  nayi tasveer optional; case → WAITING_FOR_FILE; printing + courier dobara = case
  kharcha; dobara print par attestation baqi na ho to seedha ATTESTATION_COMPLETE →
  courier), Attestations (pehle se → dobara PENDING, warna nayi; date = aaj ke baad
  pehla PK working day; case attestation se aage ho to PRINTED; attestation + courier
  dobara = case kharcha), Musadiqa (admin remark; Musadiqa queue Applied → Attested,
  commission nahi), Custom (admin remark; admin "<naam> Complete", commission nahi).
  Dobara commission sirf us kind ka jo pehle ban chuka. Admin service cancel kar sakta
  hai (amount agreed se wapas; kaam waisa). List: "Extra: naam · Rs"; kul agreed par
  hover / click = initial + services.
- **Commission office**: poori commission ASAL agreed (agreed − extraServicesAmount)
  par — service se mili commission wapas nahi; service ki amount par office ko hissa
  nahi. **Extra payment** `ExtraShareTranche` tukron mein: faisla % ya seedhi Rs (sirf
  BAQI tay na shuda extra ka); tay shuda tukra service se agreed barhne par nahi
  khulta; payment wapas / kam ho to wo tukra PERMANENT delete (BR25, §W57).
  Misaal: 55,000, 60,000 aaye → 5,000 tay; 10,000 service, 13,000 aaye → sirf 3,000
  ka sawal. Purane % faisle migration mein ek tukra (wahi raqam, ledger nahi badla).
- Partner office: services ki payments received mein → pool (received − kharche −
  dept commission) ke mutabiq shares; extra ka koi alag faisla nahi.

## BR25. Delete / badlaav ke baad purana data zinda nahi — §W57

- **Extra ke tukre** (commission office): payment delete / un-receive / raqam kam ho
  (kul RECEIVED < tukre ka receivedAt) → wo tukra aur us ke baad wale recompute mein
  PERMANENT delete; EXTRA_SHARE ledger wapas (remark "Extra faisla khatam …"). Nayi
  payment aaye to POORI maujooda extra par admin se NAYA sawal — purani extra, purana %
  ya Rs kabhi wapas nahi. Misaal: 55,000; 60,000 → 5,000 @ 50% = 2,500; payment delete
  → 0; 62,000 dobara → 7,000 ka naya sawal (pehle purana 5,000 / 50% zinda ho jata tha).
- Admin ASAL agreed seedha badle (case edit, remaining claim accept / edit, discount
  accept) → us case ke saare extra faisle khatam (buniyad badal gayi), extra bachi ho to
  naya sawal. Extra SERVICE se agreed barhna / service cancel is mein shamil nahi (BR24
  wahi: tay shuda tukra qaim).
- `Case.extraSharePercent` ab na parha jata na likha jata (W57 migration ne sab null
  kiye; jahan purana % abhi tukra nahi bana tha aur extra thi, pehle tukra bana).
- **Partner office**: case ka saara paisa / kharcha / dept commission wapas (sab hissay 0)
  → `profitShareSnapshot` + `profitFinalizedAt` hat jate hain; agli asal payment par us
  waqt ke members ke % se naya snapshot (purane % zinda nahi).
- **Stage wapas** (sirf jo usi payment ki wajah se tha): RECEIVED payment delete / status
  badla / raqam kam → (a) koi RECEIVED nahi + WAITING_FOR_FILE + filing file nahi
  (sticker ke ilawa) → FIRST_PAYMENT_PENDING; (b) WAITING_FOR_COURIER_ADDRESS /
  WAITING_FOR_COURIER + ab baqi > 0 → ATTESTATION_COMPLETE. Asal kaam ho chuka ho
  (filing file, PRINTED ya aage, DELIVERED) to kuch nahi.
- **Admin status → Attestation**: dropdown ka "Attestation — step chunein…" modal mein
  is case ki attestations ki list (number, naam, Pending / Jaari / Done, tareekh) — step
  chune baghair Confirm band. Koi attestation na ho to saaf paigham.
- **Reissue tasveer**: file picker checkbox ke label se bahar (pehle click roka jata
  tha); 4 MB se badi JPG / PNG / WebP browser mein chhoti; ghalat qisam / badi file par
  saaf 400 paigham.

## BR26. Client picture filing department ko — §W58

- Case ke client info ki tasveer (Case.clientPictureKey) ka ek STABLE link:
  `GET /api/office/cases/[id]/client-picture` (dekhne ke liye) aur `?download=1`
  (download, naam `client-picture-<case #>.<ext>`). Har request par access check, phir
  taaza signed R2 URL par redirect (10 min browser cache; `?v=` = upload ka waqt, tasveer
  badle to naya link). Pehle detail payload ka signed URL 15 min baad expire ho jata tha.
- Kaun dekh sakta hai: jo case dekh sakta hai (apna scope — admin, cashier, filing /
  department roles, booking office apna case), aur doosre office ka case ho to sirf
  FILING department permission wala user. Printing / attestation / courier ka cross-office
  user nahi (limited payload mein bhi `hasClientPicture` sirf FILING ke liye).
- Kahan nazar aati hai (thumbnail + "Dekhein" (zoom viewer) + "Download"): filing queue
  ki har row (pending + complete dono tabs), filing ka file-upload modal, filing view
  (role filing), department limited view (FILING permission), case Overview (admin /
  booking / same-office department user). PDF ho to PDF icon.

## BR27. Extra service ka auto remark — §W59

- Booking office extra service lagaye to **EK** remark banta hai (pehle do — service ka auto
  naam aur attestation list dohrate thay; "(reissue print ke baad)" / "dobara / nayi" samajh
  nahi aata tha). Code: `serviceRemark()` (`src/lib/office/case-services.ts`).
- Har department ki apni line, kaam ki tarteeb se (do ya zyada hon to numbered):
  1. Filing (reissue): "document dobara banana hai — hidayat: …" (case abhi filing se pehle ho
     to "file banate waqt dhyan dein"); nayi tasveer lagi ho to zikr.
  2. Printing (reissue, case pehle print / file ho chuka): "nayi file aane par dobara print".
  3. Attestation: har attestation ke saath (dobara) = pehle DONE thi, (nayi) = case par nahi
     thi, (pehle se baqi) = list mein thi magar abhi hui nahi; reissue ho to "(dobara print ke
     baad)", warna case attestation complete se aage tha to "case wapas attestation queue mein".
  4. Courier: case pehle DELIVERED (ya aage) tha to "kaam poora hone par dobara bhejna (nayi slip)".
  - Admin lines: Musadiqa ("Attested" karein), custom ("Complete" karein).
- Targets = jin departments ki line hai + ADMIN. **Raqam (Rs) sirf tab** jab remark sirf ADMIN
  ke liye ho (musadiqa / custom) — department walon ko paisa nahi dikhta (§N7). Pehle filing
  wale remark mein Rs tha.
- Booking office ka apna naam diya ho to remark mein `Extra service "<naam>"`; auto naam nahi
  dohraya jata. Auto naam ab `Document reissue + Attestation (A, B) + Musadiqa + <custom>`.
- Notifications: filing "document dobara banana hai — hidayat case ke Remarks mein";
  attestation "extra service — attestation A, B (dobara print ke baad)".
- Migration `20261110120000_office_wave59`: purane auto remarks ka text naye andaz mein
  (recipients / seen wahi; filing wale se Rs hata) aur purana auto naam (hisson se bilkul
  barabar ho to) naye format mein. Haath se likhe remarks / apne naam nahi chhuye.

## BR28. Dates ka nizaam: chhuttiyan, mulk, tarteeb — §W60

**Din khula hai ya nahi** — EK qaida (`src/lib/office/day-rules.ts`, `DayResolver`), har date
par: set engine, bina set attestations, extra service, expected printing date, admin ki haath
ki date. Tarteeb (pehli band wajah jeet ti hai):
1. Allowed weekdays (Saudi Embassy Tue–Fri, Mofa Saudi Mon–Wed).
2. Weekend — Pakistan Sat+Sun, Saudi Fri+Sat.
3. Admin ki `HolidayClosure` row (country + city + extra scopes) — hamesha band.
4. **Built-in calendar** (`holiday-calendar.ts`, code mein, DB / AI / internet ke baghair):
   Pakistan 5 Feb, 23 Mar, 1 May, 28 May (2024 se), 14 Aug, 6 Sep, 9 Nov (Iqbal Day), 25 Dec +
   Eid ul Fitr (1–3 Shawwal), Eid ul Adha (10–12 Zul Hajj), Ashura (9–10 Muharram), Eid Milad
   (12 Rabi ul Awal) — Umm al-Qura calendar se, Pakistan ka chand baad mein hota hai is liye har
   Islamic window 2 din aage tak. Saudi: 22 Feb (2022 se), 23 Sep, Eid ul Fitr 25 Ramzan–10
   Shawwal, Eid ul Adha 5–15 Zul Hajj (sarkari daftar). Conservative: shak ho to band.
5. AI ke dhoonde band din (HolidayClosure "AI:" rows, WorkingDayCache AI band).
- Admin ka MANUAL WorkingDayCache override (candidate = working date) Pakistan ke liye built-in
  aur AI band din ko khol deta hai (admin ki table row ko nahi).
- `FALLBACK` cache rows (AI fail par weekend-only andaza) kabhi nahi mani jati — migration
  wave60 ne delete kar di. Koi andaza cache nahi hota.

**Har attestation ka mulk / sheher** (`attestation-dates.ts` `KIND_INFO`; type ke naam / set
stepKey se pehchan): Board / bmfq → Pakistan + Quetta; UV / QR ibcc, Back / Current Navttc,
Navttc, MoH, CPLS / APAC, HEC → Pakistan + Islamabad; Special Mofa → Pakistan + Islamabad /
Gujrat / Lahore mein se pehli khuli (city note); Saudi Embassy → Islamabad + EMBASSIES_ISB,
Tue–Fri; Mofa Saudi → **Saudi Arabia** working day, Mon–Wed. Pehchan na ho → Pakistan.

**Tarteeb (owner, sakht)**: Board (bmfq / CPLS / APAC) < UV / QR ibcc (Navttc / MoH / HEC) <
Special Mofa < Saudi Embassy < Mofa Saudi — har agla pichle se kam az kam ek din BAAD.
- Set engine: har step ka floor = formula, phir pichle qadam ke baad (`work()`); Medical / CPLS /
  APAC ke steps ab Special Mofa se pehle bante hain (pehle Special Mofa ki date kabhi nahi banti thi).
  UV-mode Board ki 2019 date dobara random nahi hoti agar pehle wali sahi ho (N6 "store the pick").
  DONE step ki date regenerate par nahi badalti.
- Planner (`computeAttestationPlan` / `applyAttestationPlan`, case advisory lock): nayi / dobara
  chuni (replanIds) ya khali date → kal se (ya pichle qadam ke baad) pehla sahi din; maujooda
  date chhutti par ya tarteeb ke khilaf → aage pehla sahi din; baqi wahi. DONE kabhi nahi
  badalti (magar us ki date agle qadam ki tarteeb mein ginti hai). Set ka step khali ho to set
  engine bharta hai (payment ke baad).
- Bina set ke case, one-by-one attestation, extra service: dates **foran** (request ke andar,
  AI ke intezar ke baghair; pehle after() + AI — function ka waqt khatam ho jata to date kabhi
  nahi lagti thi; set wale case mein set se bahar ki attestation ki date kabhi nahi lagti thi).
- Admin ki haath ki scheduled date: chhutti / ghalat din ya pichle qadam se pehle → 400 (wajah ke
  saath); aage wale pending qadam khud aage khisakte hain (response `dateNotice`). Completed date
  par koi check nahi (wo asal waqia hai).

**Jaanch / theek karna** (`date-recheck.ts`): admin Holidays panel "Sab dates check karein"
(`POST /api/office/setup/recheck-dates`), holiday add / edit, working-day override, roz ka cron
(`/api/cron/office-dates`, 06:10 PKT) — pending dates chhutti / tarteeb ke khilaf → aage + case
remark (ATTESTATION + ADMIN) "Attestation dates khud theek hui…"; khali dates bhar di jati hain;
expected printing dates bhi.

**AI** (`ai-dates.ts`): sirf izafi band din dhoondta hai (additive), kabhi "khula" nahi kehta, fail
par kuch cache nahi. Har scan (scope + 14 din window) `OfficeDateScan` mein; aane wali window 7
din baad dobara. Dates lagne ke baad after() mein aur roz cron mein; naya band din mile to
planner. Model internet search nahi karta (apne ilm se) — asal bharosa built-in calendar + admin
table.

## BR29. Har date ka ONLINE check (internet khabrein + attached AI) — §W61

Owner: har woh date jo pehle se tay nahi, us par attached AI internet ki taaza maloomat se
check kare ke chhutti ka elaan to nahi hua (khaas kar Islamabad mein achanak chhuttiyan);
20 din se aage ki date par faisla nahi; waqt aur AI credits ki parwah nahi — galti nahi honi
chahiye. Admin ki haath ki date working day na ho to qareeb tareen working day.

- **Pehle se tay din** (AI nahi): weekend, built-in calendar, admin Holidays table (BR28), admin
  ka Working-day "khula" override.
- **Baqi har din**, har zaroori scope (attestation ke qaide se: PAKISTAN + sheher / EMBASSIES_ISB
  / SAUDI; Special Mofa: Pakistan + chuni hui city) ke liye (`date-verify.ts`):
  1. Online khabrein (`day-news.ts`): **Tavily** (owner ka chuna hua; key Setup → "Dates ka
     online check" panel mein, ya env TAVILY_API_KEY; topic news, advanced; aane wali dates:
     pichle 45 din ki khabrein, guzri dates: us waqt ki) — Tavily na ho / fail → GDELT (muft,
     aksar limit) — wo bhi na ho → AI sirf apne ilm se ("OFFLINE").
  2. Attached AI (Settings → Bot; live DeepSeek — khud internet nahi dekhta) khabrein parh kar
     har din ka faisla + saboot (khabar ke link) — `aiCheckDays`; har date ka jawab lazmi warna
     natija radd.
  3. `OfficeDayCheck` (date + scope) mein; band → HolidayClosure "AI: … (online)" row (admin
     panel mein, delete ho sakti) → planner date aage + remark (ATTESTATION + ADMIN) → nayi date
     ka bhi check, jab tak sab confirm na ho.
- **20 din**: is se aage ki date TENTATIVE (koi faisla / AI nahi). 20 din ke andar: check; phir
  har **20 ghante** baad dobara (roz) jab tak din guzar na jaye. Guzra din: us din ya baad ka ek
  check kaafi. OFFLINE faisla 3 ghante baad dobara. AI / internet fail → kuch nahi likha jata,
  "check baqi" rehta hai.
- **Kab chalta hai**: case banne / attestation add / extra service / set dates / payment ke baad
  (after(), 300s); case kholne par page khud `POST /cases/[id]/verify-dates` bulata hai (jab tak
  "check baqi" ho, 4 dafa tak); roz ka cron (`verifyAllOpenDates` — 20 din ke andar ki tamam
  pending attestation + expected printing dates); admin "Sab dates check karein"; nayi Tavily key
  save karne par. Ek case par ek waqt mein ek check (`Case.datesCheckingUntil` lease).
- **UI**: har pending date ke saath badge — "AI ✓ online" (waqt + saboot link) / "AI ✓ (bina
  online)" / "AI check baqi" / "Tentative (20+ din)" / "Band — date badal rahi" (admin / booking
  Attestations tab + department view).
- **Admin ki haath ki date** (§W61, BR28 ka 400 wala hissa badla): working day na ho ya tarteeb ke
  khilaf → **qareeb tareen sahi din** (wahi, +1, −1, +2, −2 …; aaj / aage ki date kabhi aaj se
  pehle nahi; pichle qadam ke BAAD, kisi DONE agle qadam se PEHLE) khud lagta hai + notice; aage
  wale pending qadam khisakte hain; phir online check. Koi sahi din na mile (±60) → 400.
- **Hifazat — purana nizaam hamesha chalta hai (owner)**: online check sirf IZAFI hai. Har date
  pehle purane qaide (BR28: built-in calendar + Holidays table + weekend + tarteeb, bina AI) se
  foran lagti / theek hoti hai. AI credits khatam (error), AI band, AI atak jaye (har scope 150s,
  khabrein 60s ki had), Tavily key ghalat / credits khatam (→ GDELT → AI ka apna ilm), internet
  band — kuch nahi likha jata, date "check baqi" ("date purane qaide se sahi hai") rehti hai aur
  baad mein dobara. Cron PEHLE purani jaanch chalata hai, phir bache waqt mein AI. Case page par AI
  fail ho to peela note: dates purane qaide se lagi hain aur sahi hain; bekaar dobara koshish band.

## BR30. Notifications sirf mutaliqa users ko — §W62

- Bell / list hamesha sirf apni (`Notification.userId = session`) — ye pehle se sahi tha. Masla
  BHEJNE mein tha.
- **Remark** ki notification (`notifyRemarkRecipients`, `remark-inbox.ts`) theek unhi users ko
  jin ke "Remarks" inbox mein wo remark aata hai: ADMIN → super admins; **BOOKING → sirf isi
  case ke office ke booking users** (+ `office:cases:read-all` wale) — pehle `notifyRole
  ("booking_office")` har office ke booking users ko remark ki text samait bhejta tha (live:
  14 din mein 17 aisi); FILING / PRINTING / ATTESTATION / COURIER → us department ka role ya us
  department ki write permission wale (cross-office, jaise queues). Likhne wala khud nahi.
- **Kaam karne wala khud nahi**: har notify helper `exclude` leta hai; tamam office routes
  `exclude: session.adminId` bhejte hain (status, files, payments, requests, payouts, courier
  stage…) — apne hi kaam ki notification nahi.
- **Attestation department** = roles `attestation_dept` + `attestation` (`notifyRole` dono ko;
  purana "atta" naam bhi — pehle printing ke baad attestation dept ko file notification kisi ko
  nahi jati thi).
- Read-only jaanch: `npx tsx scripts/office-notifications-audit.ts [din]` (role / office wise;
  doosre office ke case ki notification booking users ko).

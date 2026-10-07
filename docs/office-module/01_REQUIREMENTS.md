# 01 — Requirements (source of truth)

Captured from the owner's brief (Roman Urdu) on 2026-09-30, restated precisely.
When code and this document disagree, this document wins; fix the code.

## R0. General

- R0.1 A sub-part of the existing project. **Same database.** **Cloudflare R2** for
  file storage (not Supabase Storage).
- R0.2 A **super admin already exists** (`Admin.role = "admin"`). Do not create a new
  one. Grant it every office permission automatically and give it UI to do all of
  the tasks below itself.
- R0.3 The super admin's admin page must expose options for all office tasks:
  creating the roles/users, managing offices, categories, attestations, payments,
  ledger, finance.

## R1. Roles

### R1.1 Cashier
- Set any payment's status to **received**, **not received**, or **bogus**.
- Edit a payment's **payment date**.
- See the **remaining payment** the booking office wrote for a case and **accept or
  edit** it.
- (From R3) Reduce a booking office's commission on a specific case; decide the
  extra-amount share %; record payouts to an office/shareholder with date and
  remarks (cash / bank account / Easypaisa etc.).

### R1.2 Attestation office
- View every case: its **status**, whether it is **printed** or not, and the
  **dates of each attestation** on it.
- Change the status of each step as it completes (print done, each attestation
  done, etc.).

### R1.3 Booking office
- Add a **new case**; add its **roll number and/or registration number**.
- Set the case **category**.
- Add which **attestations are required** for the case.
- Enter a **payment date and status** and attach the **payment slip** (file).
  The payment counts only after the **super admin or cashier views the slip and
  accepts it**.
- Add, at any stage, **multiple contact numbers** and **delivery addresses** for a
  case.
- Enter the **remaining amount** for a case (which the cashier accepts/edits).

### R1.4 Booking office shareholders (type 2 offices)
- Each shareholder has **their own login**.
- A shareholder sees **all cases of their office**, including those added by other
  shareholders.

## R2. Booking office categories (set by super admin)

### Type 1 — Fixed commission per case category
- Office earns a **fixed amount per case**, depending on the case category.
- Super admin / cashier may **reduce the commission on a specific case** (customer
  paid less).
- **Half** of the commission is credited to the office account when the case's
  **first payment** is accepted (by cashier/super admin). The **remaining half** is
  credited when the **final payment** is received and accepted.
- If the customer pays **more than the agreed amount**: fixed commission goes to the
  office as usual, and of the **extra amount** a percentage (100 %, 50 %, other)
  goes to the office — decided **case by case** by cashier/super admin. The system
  must show a **pop-up**: "this case received X extra; what % of it goes to the
  booking office?".
- Cashier/super admin can **record amounts paid out** to a booking office or to one
  of its shareholders, with **date** and **remarks** (cash / account / Easypaisa …).

### Type 2 — Profit-share percentage
- Office takes a **percentage of (total received on the case − expenses on that
  case)**.
- There may be **multiple shareholders**, each with their own **percentage**.
- Under- or over-payment by the customer makes no difference: they always get their
  percentage of the profit.
- Shareholders log in separately, see all cases of the office (R1.4).

### Type 3 — Salary based
- All profit goes to the company (Alfarooq Services).
- System must support **adding salaries** for this office's staff.

## R3. Company income (super admin only)

- Complete income of Alfarooq Services visible **only to super admin**.
- Profit = received payments − booking office commissions/shares − case expenses −
  salaries − other expenses.
- Views: **daily, weekly, monthly, and custom date range**.

## R4. Expected printing date

- When a booking office enters a payment date and the cashier/super admin accepts
  the payment, every account type sees the **expected printing date**.
- Expected printing date = **first working day in Pakistan on or after
  (payment date + 6 days)**.
- Use the **AI already attached to the system** (bot provider/API key in
  SiteSettings) to determine the exact working day (weekends + Pakistani public
  holidays), and show that date.

## R5. Process

- Write a detailed plan, execution method, roadmap and an agent log so any agent
  can continue from where the previous one stopped without redoing work.
- Then start execution. No structural mistakes; analyse the whole brief carefully.

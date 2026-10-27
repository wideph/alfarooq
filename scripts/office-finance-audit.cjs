// §W41 — READ-ONLY office finance audit (kuch nahi likhta). Tamam offices /
// cases / members / department users: FIXED_COMMISSION commission + extra share
// (BR3 target vs ledger), PROFIT_SHARE har member ka hissa (pool = received −
// case exp − dept commission, snapshot %), SALARY par koi share row nahi, office
// / case expense debits + orphans, department commission ka saboot (file /
// status), aur department users ka balance. Aakhir mein "TOTAL ISSUES: N".
// Run (project root se): node scripts/office-finance-audit.cjs
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const n = (v) => Number(v || 0);
const r2 = (v) => Math.round(v * 100) / 100;
const signed = (l) => (l.direction === "CREDIT" ? n(l.amount) : -n(l.amount));
const issues = [];
const issue = (s) => { issues.push(s); console.log("ISSUE:", s); };

(async () => {
  const p = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
  const offices = await p.bookingOffice.findMany({ include: { members: true } });
  const allLedger = await p.ledgerEntry.findMany({ select: { id: true, bookingOfficeId: true, memberId: true, adminId: true, caseId: true, type: true, direction: true, amount: true, remarks: true } });
  const memberIds = new Set(offices.flatMap((o) => o.members.map((m) => m.id)));

  for (const o of offices) {
    const cases = await p.case.findMany({
      where: { bookingOfficeId: o.id },
      select: { id: true, caseNumber: true, status: true, agreedAmount: true, commissionAmount: true, extraSharePercent: true, commissionHalfCreditedAt: true, commissionFullCreditedAt: true, profitShareSnapshot: true,
        payments: { select: { amount: true, status: true } }, expenses: { select: { id: true, amount: true, deductFromCommission: true } } },
    });
    console.log(`\n=== ${o.name} [${o.type}] cases=${cases.length}`);
    for (const c of cases) {
      const rec = c.payments.filter((x) => x.status === "RECEIVED").reduce((t, x) => t + n(x.amount), 0);
      const L = allLedger.filter((l) => l.caseId === c.id);
      if (o.type === "FIXED_COMMISSION") {
        const com = n(c.commissionAmount), half = r2(com / 2), agreed = n(c.agreedAmount);
        const target = rec > 0 ? (agreed > 0 && rec >= agreed ? com : half) : 0;
        const cur = r2(L.filter((l) => ["COMMISSION_HALF", "COMMISSION_FINAL", "COMMISSION_ADJUST"].includes(l.type)).reduce((t, l) => t + signed(l), 0));
        if (Math.abs(cur - target) > 0.005) issue(`${o.name} ${c.caseNumber}: commission ledger ${cur} ≠ target ${target} (rec ${rec}, agreed ${agreed}, commission ${com})`);
        const extra = Math.max(rec - agreed, 0);
        const exCur = r2(L.filter((l) => l.type === "EXTRA_SHARE").reduce((t, l) => t + signed(l), 0));
        if (c.extraSharePercent !== null) {
          const exTarget = r2(extra * n(c.extraSharePercent) / 100);
          if (Math.abs(exCur - exTarget) > 0.005) issue(`${o.name} ${c.caseNumber}: extra share ledger ${exCur} ≠ target ${exTarget} (extra ${extra} × ${n(c.extraSharePercent)}%)`);
        } else if (exCur !== 0) issue(`${o.name} ${c.caseNumber}: extra share ${exCur} hai magar percent null`);
        if (extra > 0 && c.extraSharePercent === null) console.log(`  note ${c.caseNumber}: extra ${extra} ka faisla baqi (percent null)`);
        // case expense with flag → "Commission expense [expenseId]" debit
        for (const e of c.expenses.filter((e) => e.deductFromCommission)) {
          const d = allLedger.filter((l) => l.type === "EXPENSE" && (l.remarks || "").startsWith(`Commission expense [${e.id}]`));
          if (r2(d.reduce((t, l) => t - signed(l), 0)) !== n(e.amount)) issue(`${o.name} ${c.caseNumber}: case expense ${n(e.amount)} (flag) ka debit ${JSON.stringify(d.map((x) => n(x.amount)))}`);
        }
      } else if (o.type === "PROFIT_SHARE") {
        const exp = c.expenses.reduce((t, e) => t + n(e.amount), 0);
        const dept = L.filter((l) => l.type === "DEPT_COMMISSION").reduce((t, l) => t + signed(l), 0);
        const pool = rec - exp - dept;
        const snap = c.profitShareSnapshot && typeof c.profitShareSnapshot === "object" ? c.profitShareSnapshot : null;
        const shareRows = L.filter((l) => ["PROFIT_SHARE", "ADJUSTMENT"].includes(l.type));
        if (!snap && shareRows.length === 0) { if (rec || exp || dept) issue(`${o.name} ${c.caseNumber}: paisa hai (rec ${rec}) magar profit share bana hi nahi`); continue; }
        const ids = new Set([...Object.keys(snap || {}), ...shareRows.map((l) => l.memberId || "NULL")]);
        for (const id of ids) {
          const pct = snap ? n(snap[id]) : 0;
          const target = r2(pool * pct / 100);
          const cur = r2(shareRows.filter((l) => (l.memberId || "NULL") === id).reduce((t, l) => t + signed(l), 0));
          if (Math.abs(cur - target) > 0.005) issue(`${o.name} ${c.caseNumber}: member ${o.members.find((m) => m.id === id)?.name || id} share ${cur} ≠ target ${target} (pool ${pool} × ${pct}%)`);
        }
        if (L.some((l) => ["COMMISSION_HALF", "COMMISSION_FINAL", "COMMISSION_ADJUST", "EXTRA_SHARE"].includes(l.type))) issue(`${o.name} ${c.caseNumber}: PROFIT_SHARE case par commission rows`);
      } else {
        if (L.some((l) => ["COMMISSION_HALF", "COMMISSION_FINAL", "COMMISSION_ADJUST", "EXTRA_SHARE", "PROFIT_SHARE", "ADJUSTMENT"].includes(l.type))) issue(`${o.name} ${c.caseNumber}: ${o.type} case par commission/share rows`);
      }
    }
    // Office expenses → member debits
    const oexp = await p.officeExpense.findMany({ where: { bookingOfficeId: o.id }, select: { id: true, amount: true, deductFromCommission: true, description: true } });
    for (const e of oexp) {
      const tag = o.type === "PROFIT_SHARE" ? `Office expense share [${e.id}]` : `Commission expense share [${e.id}]`;
      const d = allLedger.filter((l) => l.type === "EXPENSE" && (l.remarks || "").startsWith(tag));
      const debited = r2(d.reduce((t, l) => t - signed(l), 0));
      if (o.type === "PROFIT_SHARE") {
        const pctSum = o.members.filter((m) => m.isActive).reduce((t, m) => t + n(m.profitPercent), 0);
        const expected = o.members.filter((m) => m.isActive && n(m.profitPercent) > 0).reduce((t, m) => t + r2(n(e.amount) * n(m.profitPercent) / 100), 0);
        if (Math.abs(debited - expected) > 0.005) issue(`${o.name} office expense ${n(e.amount)} "${e.description}": member debits ${debited} ≠ ${expected} (Σ% ${pctSum})`);
      } else if (o.type === "FIXED_COMMISSION" && e.deductFromCommission && Math.abs(debited - n(e.amount)) > 0.005) {
        issue(`${o.name} office expense ${n(e.amount)} (flag): debits ${debited}`);
      }
    }
    // Orphan expense debits (expense delete ho gaya)
    const oexpIds = new Set(oexp.map((e) => e.id));
    for (const l of allLedger.filter((l) => l.bookingOfficeId === o.id && l.type === "EXPENSE")) {
      const m = /^(Office expense share|Commission expense share) \[([^\]]+)\]/.exec(l.remarks || "");
      if (m && !oexpIds.has(m[2])) issue(`${o.name}: orphan EXPENSE debit ${n(l.amount)} (office expense ${m[2]} maujood nahi)`);
    }
  }
  // Ledger rows jin ka member delete ho chuka (memberId null on member-type rows) / unknown member
  for (const l of allLedger) {
    if (l.memberId && !memberIds.has(l.memberId)) issue(`ledger ${l.id} ${l.type} ${n(l.amount)}: member ${l.memberId} maujood nahi`);
    if (!l.memberId && ["PROFIT_SHARE", "ADJUSTMENT"].includes(l.type)) issue(`ledger ${l.id} ${l.type} ${n(l.amount)}: memberId null (share kisi ke account mein nahi)`);
  }
  // Case expense flag debits orphan
  const caseExpIds = new Set((await p.caseExpense.findMany({ select: { id: true } })).map((e) => e.id));
  for (const l of allLedger.filter((l) => l.type === "EXPENSE")) {
    const m = /^Commission expense \[([^\]]+)\]/.exec(l.remarks || "");
    if (m && !caseExpIds.has(m[1])) issue(`orphan case-expense debit ${n(l.amount)} (case expense ${m[1]} maujood nahi)`);
  }
  // Dept commissions — saboot
  const dept = allLedger.filter((l) => l.type === "DEPT_COMMISSION");
  for (const d of dept) {
    const kind = (d.remarks || "").split(" ")[0];
    const c = await p.case.findUnique({ where: { id: d.caseId || "" }, select: { caseNumber: true, status: true, _count: { select: { files: true } } } });
    const files = await p.caseFile.count({ where: { caseId: d.caseId || "", department: kind === "COURIER" ? "COURIER" : kind === "PRINTING" ? "PRINTING" : "ATTESTATION" } });
    const ok = kind === "PRINTING" ? files > 0 : kind === "COURIER" ? files > 0 : ["ATTESTATION_COMPLETE", "WAITING_FOR_COURIER_ADDRESS", "WAITING_FOR_COURIER", "DELIVERED"].includes(c?.status || "") || (c?.status || "").startsWith("MUSADIQA");
    console.log(`dept ${kind} ${n(d.amount)} ${d.direction} ${c?.caseNumber} status=${c?.status} files(${kind})=${files} ${ok ? "OK" : "SABOOT NAHI"}`);
    if (!ok) issue(`dept ${kind} commission ${n(d.amount)} on ${c?.caseNumber}: saboot nahi (status ${c?.status}, files ${files})`);
  }
  // Dept users balance
  const deptUsers = [...new Set(dept.map((d) => d.adminId))];
  for (const a of deptUsers) {
    const rows = allLedger.filter((l) => l.adminId === a && (l.type === "DEPT_COMMISSION" || (l.type === "PAYOUT" && l.direction === "DEBIT")));
    console.log(`dept user ${a}: credits ${rows.filter((r) => r.type === "DEPT_COMMISSION").reduce((t, r) => t + signed(r), 0)} payouts ${rows.filter((r) => r.type === "PAYOUT").reduce((t, r) => t + n(r.amount), 0)}`);
  }
  console.log(`\nTOTAL ISSUES: ${issues.length}`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });

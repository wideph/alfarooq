import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dec, round2, toNumber } from "@/lib/office/money";
import { commissionExpenseTag } from "@/lib/office/expense-deduction";
import { DEPT_OTHER_EXPENSE_CATEGORY } from "@/lib/office/dept-expenses";

// §W54 — case delete ho aur us par department user ka MANZOOR shuda kharcha
// (CaseExpense.paidByAdminId) ho to admin ka faisla:
//   OTHER   — "Other expenses mein": CompanyExpense (DEPT_OTHER) — sirf admin ka
//             kharcha; user ki wapsi (admin se wasooli) baqi.
//   OFFICE  — "Usi office par rahe": OfficeExpense (paidByAdminId = user) usi
//             booking office par, aur jo hissa abhi jahan para tha wahin:
//               partner office → har shareholder ke % (case ka snapshot, warna
//                 abhi ke active %) ka EXPENSE DEBIT `Office expense share [id]`;
//               commission office → jitna case par commission se minus tha utna
//                 hi usi member par `Commission expense share [id]` (flag on);
//               salary office → koi member row nahi (admin ka kharcha).
//             Finance in tags se member ka hissa admin ke profit se alag karta hai.
//             User ki wapsi baqi.
//   REVERSE — "Har jagah se reverse": kharcha khatam (case ke saath), user ka
//             wapsi ka haq bhi khatam — wapsi pehle di ho to us ka hisaab minus.
// Review mein pade (PENDING) kharche is faisle mein nahi — wo Payments →
// Department kharche mein rehte hain (manzoori par Other expenses).

export const CASE_DELETE_EXPENSE_CHOICES = ["OTHER", "OFFICE", "REVERSE"] as const;
export type CaseDeleteExpenseChoice = (typeof CASE_DELETE_EXPENSE_CHOICES)[number];

export function isCaseDeleteExpenseChoice(value: unknown): value is CaseDeleteExpenseChoice {
  return typeof value === "string" && (CASE_DELETE_EXPENSE_CHOICES as readonly string[]).includes(value);
}

export async function loadCaseDeptExpenses(caseId: string) {
  const item = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      caseNumber: true,
      bookingOfficeId: true,
      profitShareSnapshot: true,
      bookingOffice: {
        select: { name: true, type: true, members: { select: { id: true, profitPercent: true, isActive: true } } },
      },
      expenses: {
        where: { paidByAdminId: { not: null } },
        select: { id: true, amount: true, description: true, expenseDate: true, paidByAdminId: true, createdById: true, kind: true },
      },
    },
  });
  if (!item) return null;
  const [deductRows, pendingReviews, users] = await Promise.all([
    item.expenses.length
      ? prisma.ledgerEntry.findMany({
          where: { caseId, type: "EXPENSE", remarks: { startsWith: "Commission expense [" } },
          select: { amount: true, direction: true, memberId: true, remarks: true },
        })
      : [],
    prisma.deptExpenseRequest.count({ where: { caseId, status: "PENDING" } }),
    item.expenses.length
      ? prisma.admin.findMany({
          where: { id: { in: item.expenses.map((expense) => expense.paidByAdminId as string) } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const names = new Map(users.map((user) => [user.id, user.name]));
  const expenses = item.expenses.map((expense) => {
    const tag = commissionExpenseTag(expense.id);
    const rows = deductRows.filter((row) => row.remarks?.startsWith(tag));
    return {
      ...expense,
      userName: names.get(expense.paidByAdminId as string) ?? null,
      // Commission office: is kharche ka jo hissa member se minus tha (member ke saath).
      deductions: rows.map((row) => ({
        memberId: row.memberId,
        amount: row.direction === "DEBIT" ? row.amount : row.amount.neg(),
      })),
    };
  });
  return { item, expenses, pendingReviews };
}

export type CaseDeptExpenses = NonNullable<Awaited<ReturnType<typeof loadCaseDeptExpenses>>>;

// 409 jawab — admin ko faisle ke liye maloomat.
export function deptExpenseDecisionPayload(data: CaseDeptExpenses) {
  return {
    caseNumber: data.item.caseNumber,
    officeName: data.item.bookingOffice.name,
    officeType: data.item.bookingOffice.type,
    pendingReviews: data.pendingReviews,
    total: toNumber(data.expenses.reduce((acc, expense) => acc.plus(expense.amount), dec(0))),
    expenses: data.expenses.map((expense) => ({
      id: expense.id,
      amount: toNumber(expense.amount),
      description: expense.description,
      userName: expense.userName,
      commissionDeducted: toNumber(expense.deductions.reduce((acc, row) => acc.plus(row.amount), dec(0))),
    })),
  };
}

// Case delete ki batch transaction mein jodne wale writes (case ki apni rows
// hatne se pehle / saath). REVERSE par koi extra write nahi.
export function deptExpenseDeleteOps(
  data: CaseDeptExpenses,
  choice: CaseDeleteExpenseChoice,
  actorId: string
): Prisma.PrismaPromise<unknown>[] {
  if (data.expenses.length === 0 || choice === "REVERSE") return [];
  const label = (description: string) => `Case ${data.item.caseNumber} (delete ho chuka) — ${description}`.slice(0, 300);

  if (choice === "OTHER") {
    return [
      prisma.companyExpense.createMany({
        data: data.expenses.map((expense) => ({
          amount: expense.amount,
          description: label(expense.description),
          category: DEPT_OTHER_EXPENSE_CATEGORY,
          expenseDate: expense.expenseDate,
          paidByAdminId: expense.paidByAdminId,
          createdById: expense.createdById,
        })),
      }),
    ];
  }

  // OFFICE
  const office = data.item.bookingOffice;
  const snapshot =
    data.item.profitShareSnapshot && typeof data.item.profitShareSnapshot === "object" && !Array.isArray(data.item.profitShareSnapshot)
      ? (data.item.profitShareSnapshot as Record<string, number>)
      : Object.fromEntries(office.members.filter((member) => member.isActive).map((member) => [member.id, Number(member.profitPercent)]));

  const officeRows: Prisma.OfficeExpenseCreateManyInput[] = [];
  const debits: Prisma.LedgerEntryCreateManyInput[] = [];
  for (const expense of data.expenses) {
    const officeExpenseId = randomUUID();
    const description = label(expense.description);
    officeRows.push({
      id: officeExpenseId,
      bookingOfficeId: data.item.bookingOfficeId,
      amount: expense.amount,
      description,
      expenseDate: expense.expenseDate,
      // Commission office: tagged rows hi hissa hain (office expense delete par
      // reversal row nahi, tagged rows hatti hain).
      deductFromCommission: office.type === "FIXED_COMMISSION",
      paidByAdminId: expense.paidByAdminId,
      // §W55: user ki wapsi apni qism (courier / Bykea → Other expenses) mein rahe.
      kind: expense.kind,
      createdById: expense.createdById,
    });
    const debit = (memberId: string | null, amount: Prisma.Decimal, tag: string) => {
      if (!amount.greaterThan(0)) return;
      debits.push({
        bookingOfficeId: data.item.bookingOfficeId,
        memberId,
        type: "EXPENSE",
        direction: "DEBIT",
        amount,
        entryDate: expense.expenseDate,
        remarks: `${tag} [${officeExpenseId}]: ${description}`.slice(0, 500),
        createdById: actorId,
      });
    };
    if (office.type === "PROFIT_SHARE") {
      for (const [memberId, percent] of Object.entries(snapshot)) {
        debit(memberId, round2(dec(expense.amount).mul(dec(percent)).div(100)), "Office expense share");
      }
    } else if (office.type === "FIXED_COMMISSION") {
      for (const row of expense.deductions) debit(row.memberId, round2(row.amount), "Commission expense share");
    }
  }
  return [
    prisma.officeExpense.createMany({ data: officeRows }),
    ...(debits.length ? [prisma.ledgerEntry.createMany({ data: debits })] : []),
  ];
}

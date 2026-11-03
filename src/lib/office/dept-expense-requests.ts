import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";
import { syncCommissionExpenseDeductions } from "@/lib/office/expense-deduction";
import { DEPT_OTHER_EXPENSE_CATEGORY, isCaseDeptExpenseKind } from "@/lib/office/dept-expenses";

// §W52 — department user ka kharcha pehle admin ke REVIEW mein
// (DeptExpenseRequest PENDING) — us dauran system ke kisi hisaab mein nahi.
// Admin manzoor kare to yahan asal kharcha banta hai (§W51 wala nizam):
//   COURIER → us case ka CaseExpense (kind COURIER, paidByAdminId = user) +
//             commission office ka rule (syncCommissionExpenseDeductions);
//             partner office ka pool caller after() mein syncProfitShare se.
//   BYKEA   → §W55: COURIER jaisa (us case ka CaseExpense kind BYKEA) — sirf
//             user ki wapsi "Other expenses" hisaab mein.
//   OTHER   → CompanyExpense (DEPT_OTHER) — sirf admin ke profit se minus.
// Case review ke dauran delete ho gaya ho to case wala kharcha Other expenses
// ban jata hai (review card par admin ko pehle se likha nazar aata hai).

export const DEPT_EXPENSE_REQUEST_KINDS = ["COURIER", "BYKEA", "OTHER"] as const;
export type DeptExpenseRequestKind = (typeof DEPT_EXPENSE_REQUEST_KINDS)[number];

export async function pendingDeptExpenseReviewCount() {
  return prisma.deptExpenseRequest.count({ where: { status: "PENDING" } });
}

export async function createDeptExpenseRequest(input: {
  adminId: string;
  kind: DeptExpenseRequestKind;
  caseId?: string | null;
  caseNumber?: string | null;
  amount: Prisma.Decimal;
  description: string;
  expenseDate: Date;
}) {
  return prisma.deptExpenseRequest.create({
    data: {
      adminId: input.adminId,
      kind: input.kind,
      caseId: input.caseId ?? null,
      caseNumber: input.caseNumber ?? null,
      amount: input.amount,
      description: input.description,
      expenseDate: input.expenseDate,
      status: "PENDING",
    },
  });
}

export class DeptExpenseDecidedError extends Error {
  constructor() {
    super("Ye kharcha pehle hi decide ho chuka");
  }
}

// Manzoori: asal kharcha + request ACCEPTED, ek hi transaction mein. `amount`
// admin ki theek ki hui raqam (na ho to user wali).
export async function acceptDeptExpenseRequest(
  id: string,
  session: AdminSession,
  options: { amount?: Prisma.Decimal | null; note?: string | null } = {}
) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.deptExpenseRequest.findUnique({ where: { id } });
    if (!request || request.status !== "PENDING") throw new DeptExpenseDecidedError();
    const amount = options.amount ?? request.amount;
    const changed = !amount.equals(request.amount);

    let caseExpenseId: string | null = null;
    let companyExpenseId: string | null = null;
    let caseId: string | null = null;
    const liveCase =
      isCaseDeptExpenseKind(request.kind) && request.caseId
        ? await tx.case.findUnique({ where: { id: request.caseId }, select: { id: true } })
        : null;

    if (liveCase) {
      const expense = await tx.caseExpense.create({
        data: {
          caseId: liveCase.id,
          amount,
          description: request.description,
          expenseDate: request.expenseDate,
          kind: request.kind,
          paidByAdminId: request.adminId,
          createdById: request.adminId,
        },
      });
      await syncCommissionExpenseDeductions(liveCase.id, session.adminId, tx);
      caseExpenseId = expense.id;
      caseId = liveCase.id;
    } else {
      const description =
        isCaseDeptExpenseKind(request.kind)
          ? `Case ${request.caseNumber ?? ""} (delete ho chuka) — ${request.description}`
          : request.description;
      const expense = await tx.companyExpense.create({
        data: {
          amount,
          description: description.slice(0, 300),
          category: DEPT_OTHER_EXPENSE_CATEGORY,
          expenseDate: request.expenseDate,
          paidByAdminId: request.adminId,
          createdById: request.adminId,
        },
      });
      companyExpenseId = expense.id;
    }

    const updated = await tx.deptExpenseRequest.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        amount,
        requestedAmount: changed ? request.amount : null,
        decisionNote: options.note ?? null,
        decidedById: session.adminId,
        decidedAt: new Date(),
        caseExpenseId,
        companyExpenseId,
      },
    });
    return { request: updated, before: request, caseId };
  }, { maxWait: 10000, timeout: 30000 });
}

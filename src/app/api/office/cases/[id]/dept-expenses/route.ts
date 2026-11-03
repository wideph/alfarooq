import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { parseAmount, toNumber } from "@/lib/office/money";
import { notifyAdmins } from "@/lib/office/notifications";
import { syncProfitShare } from "@/lib/office/profit-share";
import { cleanText, parseDateOnly, todayPakistan, toJson } from "@/lib/office/serializers";
import { syncCommissionExpenseDeductions } from "@/lib/office/expense-deduction";
import { COURIER_EXPENSE_KIND } from "@/lib/office/dept-expenses";
import { createDeptExpenseRequest } from "@/lib/office/dept-expense-requests";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// §W51 / §W52 — POST { amount, description?, expenseDate? } (courier permission):
// courier ka kharcha is case par.
//   Department user → admin ka REVIEW (DeptExpenseRequest PENDING). Manzoori
//     tak system ke kisi hisaab mein nahi; manzoor hone par us case ka
//     CaseExpense (kind COURIER) → partner pool (% ke mutabiq), commission office
//     ka rule, admin profit, aur user ki "admin se wasooli".
//   Super admin khud daale → seedha company ka kharcha (review / wapsi nahi).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:courier:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    // §W18: courier permission kisi bhi office ke case par kaam deti hai
    // (files route jaisa).
    const item =
      (await findAccessibleCase(session, id)) ?? (await prisma.case.findFirst({ where: { id } }));
    if (!item) return notFound("Case nahi mila");

    const body = await request.json().catch(() => ({}));
    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Courier amount sahi nahi hai (0 se zyada, maslan 350)");
    const note = cleanText(body.description, 250);
    const description = note ? `Courier charges — ${note}` : "Courier charges";
    const expenseDate = parseDateOnly(body.expenseDate) ?? todayPakistan();

    if (session.role !== "admin") {
      const review = await createDeptExpenseRequest({
        adminId: session.adminId,
        kind: "COURIER",
        caseId: item.id,
        caseNumber: item.caseNumber,
        amount,
        description,
        expenseDate,
      });
      after(async () => {
        await logOfficeAction(session, {
          action: "dept.expense.request",
          entity: "DeptExpenseRequest",
          entityId: review.id,
          after: { kind: "COURIER", caseId: id, caseNumber: item.caseNumber, amount, expenseDate },
        });
        await notifyAdmins({
          type: "dept.expense",
          title: `Review: courier kharcha Rs ${toNumber(amount).toLocaleString("en-PK")} — Case ${item.caseNumber}`,
          body: `${session.name} ne bheja — manzoor / wapas karein`,
          link: "/office/payments?view=expenses",
        });
      });
      return NextResponse.json(
        toJson({ ok: true, pending: true, request: { id: review.id, amount: review.amount, status: review.status } }),
        { status: 201 }
      );
    }

    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.caseExpense.create({
        data: {
          caseId: id,
          amount,
          description,
          expenseDate,
          kind: COURIER_EXPENSE_KIND,
          paidByAdminId: null,
          createdById: session.adminId,
        },
      });
      // Commission office ka rule (default 0) — case expense jaisa.
      await syncCommissionExpenseDeductions(id, session.adminId, tx);
      return created;
    }, { maxWait: 10000, timeout: 30000 });

    after(async () => {
      await logOfficeAction(session, {
        action: "case.expense.courier",
        entity: "Case",
        entityId: id,
        after: { expenseId: expense.id, amount, expenseDate },
      });
      // Partner case ka pool dobara (shares % ke mutabiq minus).
      await syncProfitShare(id, session.adminId);
    });

    return NextResponse.json(
      toJson({ ok: true, pending: false, expense: { id: expense.id, amount: expense.amount } }),
      { status: 201 }
    );
  } catch (error) {
    return serverError(error);
  }
}

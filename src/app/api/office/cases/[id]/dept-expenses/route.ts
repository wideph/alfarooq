import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { parseAmount, toNumber } from "@/lib/office/money";
import { notifyPermission } from "@/lib/office/notifications";
import { syncProfitShare } from "@/lib/office/profit-share";
import { cleanText, parseDateOnly, todayPakistan, toJson } from "@/lib/office/serializers";
import { syncCommissionExpenseDeductions } from "@/lib/office/expense-deduction";
import { COURIER_EXPENSE_KIND } from "@/lib/office/dept-expenses";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// §W51 — POST { amount, description?, expenseDate? } (courier permission):
// courier slip ke saath (ya baad mein) courier ka kharcha. Us case ka
// CaseExpense ban jata hai (kind COURIER) — har formula mein case expense ki
// tarah: partner office pool (% ke mutabiq), commission office ka rule, admin
// profit. User ne apni jeb se diya → paidByAdminId (admin se wasooli baqi).
// Super admin khud daale to company ka kharcha (wapsi nahi).
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
    const expenseDate = parseDateOnly(body.expenseDate) ?? todayPakistan();
    const reimbursable = session.role !== "admin";

    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.caseExpense.create({
        data: {
          caseId: id,
          amount,
          description: note ? `Courier charges — ${note}` : "Courier charges",
          expenseDate,
          kind: COURIER_EXPENSE_KIND,
          paidByAdminId: reimbursable ? session.adminId : null,
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
        after: { expenseId: expense.id, amount, expenseDate, paidByAdminId: expense.paidByAdminId },
      });
      // Partner case ka pool dobara (shares % ke mutabiq minus).
      await syncProfitShare(id, session.adminId);
      if (reimbursable) {
        await notifyPermission("office:ledger:write", {
          type: "dept.expense",
          title: `Case ${item.caseNumber}: courier kharcha Rs ${toNumber(amount).toLocaleString("en-PK")}`,
          body: `${session.name} ne diya — admin se wasooli baqi`,
          link: "/office/finance",
        });
      }
    });

    return NextResponse.json(
      toJson({
        ok: true,
        expense: {
          id: expense.id,
          amount: expense.amount,
          description: expense.description,
          expenseDate: expense.expenseDate,
          createdAt: expense.createdAt,
        },
      }),
      { status: 201 }
    );
  } catch (error) {
    return serverError(error);
  }
}

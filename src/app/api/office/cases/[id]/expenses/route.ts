import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { parseAmount, parsePercent } from "@/lib/office/money";
import { syncProfitShare } from "@/lib/office/profit-share";
import { cleanText, parseDateOnly } from "@/lib/office/serializers";
import { commissionExpenseTag, syncCommissionExpenseDeductions } from "@/lib/office/expense-deduction";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// §W21 (F3): body.deductFromCommission — boolean ya "true"/"1" dono accept.
function parseFlag(input: unknown): boolean {
  return input === true || input === "true" || input === "1";
}

// §W14.4 / §W40 — case expense add/delete ke baad partner (PROFIT_SHARE) case
// ka profit pool dobara (syncProfitShare: kabhi throw nahi karta).

// Case-level expenses (BR4.2 profit calc, BR6 income report).
// §W51: commission office (FIXED_COMMISSION) par expense ka kitna % commission
// member se minus — case ka rule (Case.expenseDeductPercent, case bante waqt
// office ka rule; default 0) ya admin ka is expense par faisla
// (commissionDeductPercent). Purana W21 `deductFromCommission: true` = 100%.
// Ledger row `syncCommissionExpenseDeductions` likhta hai (case ka commission
// member, §W45) — remarks tag `Commission expense [<expenseId>]:`.
// PROFIT_SHARE par koi row nahi (pool logic; double-deduct nahi).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    const body = await request.json();
    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai");
    // §W14.1: tafseel (description) ab OPTIONAL hai — empty ho to "" store.
    const description = cleanText(body.description, 300) || "";
    const expenseDate = parseDateOnly(body.expenseDate);
    if (!expenseDate) return badRequest("Expense date zaroori hai");
    const commissionDeductPercent = parseFlag(body.deductFromCommission) ? parsePercent(100) : null;

    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.caseExpense.create({
        data: {
          caseId: id,
          amount,
          description,
          expenseDate,
          commissionDeductPercent,
          deductFromCommission: Boolean(commissionDeductPercent),
          createdById: session.adminId,
        },
      });
      await syncCommissionExpenseDeductions(id, session.adminId, tx);
      return created;
    }, { maxWait: 10000, timeout: 30000 });
    // W13.2: audit log response ke baad.
    after(async () => {
      await logOfficeAction(session, { action: "case.expense.add", entity: "Case", entityId: id, after: expense });
      // §W14.4: partner case ka profit auto re-finalize (share auto minus).
      await syncProfitShare(id, session.adminId);
    });
    return NextResponse.json(await loadCaseDetail(session, id), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

// §W51 — PATCH { expenseId, commissionDeductPercent: 0–100 | null } (super
// admin): is expense ka kitna % case ke commission member se minus. null =
// case ka rule. Sirf commission office ke case par.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  if (session.role !== "admin") return forbidden("Expense commission se minus karne ka faisla sirf admin ka hai");
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id, {
      bookingOffice: { select: { type: true } },
    });
    if (!item) return notFound("Case nahi mila");
    if (item.bookingOffice.type !== "FIXED_COMMISSION") {
      return badRequest("Ye option sirf commission office ke case par hai");
    }
    const body = await request.json().catch(() => ({}));
    const expenseId = typeof body.expenseId === "string" ? body.expenseId : "";
    const expense = await prisma.caseExpense.findFirst({ where: { id: expenseId, caseId: id } });
    if (!expense) return notFound("Expense nahi mila");
    const raw = body.commissionDeductPercent;
    const percent = raw === null || raw === "" ? null : parsePercent(raw);
    if (raw !== null && raw !== "" && percent === null) return badRequest("Percentage 0 se 100 ke darmiyan ho");

    const result = await prisma.$transaction(async (tx) => {
      await tx.caseExpense.update({ where: { id: expense.id }, data: { commissionDeductPercent: percent } });
      return syncCommissionExpenseDeductions(id, session.adminId, tx);
    }, { maxWait: 10000, timeout: 30000 });
    if (!result.memberId && percent && percent.greaterThan(0)) {
      // Commission kisi member ke account mein nahi — faisla wapas.
      await prisma.caseExpense.update({
        where: { id: expense.id },
        data: { commissionDeductPercent: expense.commissionDeductPercent },
      });
      return badRequest("Is case ki commission kisi member ke account mein nahi — minus kis se ho?");
    }

    after(async () => {
      await logOfficeAction(session, {
        action: "case.expense.commission-deduct",
        entity: "Case",
        entityId: id,
        before: { expenseId: expense.id, commissionDeductPercent: expense.commissionDeductPercent },
        after: { expenseId: expense.id, commissionDeductPercent: percent, memberId: result.memberId },
      });
    });
    return NextResponse.json(await loadCaseDetail(session, id));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  const { id } = await params;
  const item = await findAccessibleCase(session, id);
  if (!item) return notFound("Case nahi mila");
  const expenseId = new URL(request.url).searchParams.get("expenseId") || "";
  const expense = await prisma.caseExpense.findFirst({ where: { id: expenseId, caseId: id } });
  if (!expense) return notFound("Expense nahi mila");
  await prisma.$transaction(async (tx) => {
    // §W21 / §W51: commission se minus hone wali (tagged) ledger rows bhi isi
    // transaction mein delete.
    await tx.ledgerEntry.deleteMany({
      where: {
        bookingOfficeId: item.bookingOfficeId,
        type: "EXPENSE",
        remarks: { startsWith: `${commissionExpenseTag(expenseId)}:` },
      },
    });
    await tx.caseExpense.delete({ where: { id: expenseId } });
  }, { maxWait: 10000, timeout: 30000 });
  // W13.2: audit log response ke baad.
  after(async () => {
    await logOfficeAction(session, { action: "case.expense.remove", entity: "Case", entityId: id, before: expense });
    // §W14.4: partner case ka profit auto re-finalize (share auto adjust).
    await syncProfitShare(id, session.adminId);
  });
  return NextResponse.json(await loadCaseDetail(session, id));
}

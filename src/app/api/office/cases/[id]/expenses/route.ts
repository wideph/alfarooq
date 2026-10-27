import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { parseAmount } from "@/lib/office/money";
import { syncProfitShare } from "@/lib/office/profit-share";
import { cleanText, parseDateOnly } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// §W21 (F3): body.deductFromCommission — boolean ya "true"/"1" dono accept.
function parseFlag(input: unknown): boolean {
  return input === true || input === "true" || input === "1";
}

// §W14.4 / §W40 — case expense add/delete ke baad partner (PROFIT_SHARE) case
// ka profit pool dobara (syncProfitShare: kabhi throw nahi karta).

// Case-level expenses (BR4.2 profit calc, BR6 income report).
// §W21 (F3): `deductFromCommission` flag (default false). SIRF jab case ka
// office FIXED_COMMISSION ho aur flag on ho, expense ka ek EXPENSE DEBIT
// ledger entry case ke commission member (createdByAdminId wala member) ke
// account par banta hai — remarks tag `Commission expense [<expenseId>]:`
// idempotency/reversal ke liye. PROFIT_SHARE par flag store hota hai magar
// behavior wahi rehta hai (pool logic; double-deduct nahi).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id, {
      bookingOffice: {
        select: { type: true, members: { select: { id: true, adminId: true } } },
      },
    });
    if (!item) return notFound("Case nahi mila");
    const body = await request.json();
    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai");
    // §W14.1: tafseel (description) ab OPTIONAL hai — empty ho to "" store.
    const description = cleanText(body.description, 300) || "";
    const expenseDate = parseDateOnly(body.expenseDate);
    if (!expenseDate) return badRequest("Expense date zaroori hai");
    const deductFromCommission = parseFlag(body.deductFromCommission);

    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.caseExpense.create({
        data: { caseId: id, amount, description, expenseDate, deductFromCommission, createdById: session.adminId },
      });
      // §W21 (F3): FIXED_COMMISSION + flag → commission member se minus.
      if (deductFromCommission && item.bookingOffice.type === "FIXED_COMMISSION") {
        const attributionMemberId =
          item.bookingOffice.members.find((member) => member.adminId === item.createdByAdminId)?.id ?? null;
        await tx.ledgerEntry.create({
          data: {
            bookingOfficeId: item.bookingOfficeId,
            memberId: attributionMemberId,
            caseId: id,
            type: "EXPENSE",
            direction: "DEBIT",
            amount,
            entryDate: expenseDate,
            remarks: `Commission expense [${created.id}]: ${description}`,
            createdById: session.adminId,
          },
        });
      }
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

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  const { id } = await params;
  const item = await findAccessibleCase(session, id);
  if (!item) return notFound("Case nahi mila");
  const expenseId = new URL(request.url).searchParams.get("expenseId") || "";
  const expense = await prisma.caseExpense.findFirst({
    where: { id: expenseId, caseId: id },
    include: { case: { select: { bookingOffice: { select: { type: true } } } } },
  });
  if (!expense) return notFound("Expense nahi mila");
  await prisma.$transaction(async (tx) => {
    // §W21 (F3): commission-se-deduct expense ke member-tagged ledger rows
    // bhi isi transaction mein delete (wave-15 reversal pattern wali mirror).
    if (expense.deductFromCommission && expense.case.bookingOffice.type === "FIXED_COMMISSION") {
      await tx.ledgerEntry.deleteMany({
        where: {
          bookingOfficeId: item.bookingOfficeId,
          type: "EXPENSE",
          remarks: { startsWith: `Commission expense [${expenseId}]:` },
        },
      });
    }
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

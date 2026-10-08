import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { parseAmount } from "@/lib/office/money";
import { cleanText, parseDateOnly } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// Case-level expenses (BR4.2 profit calc, BR6 income report).
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
    const description = cleanText(body.description, 300);
    if (!description) return badRequest("Expense ki tafseel likhein");
    const expenseDate = parseDateOnly(body.expenseDate);
    if (!expenseDate) return badRequest("Expense date zaroori hai");

    const expense = await prisma.caseExpense.create({
      data: { caseId: id, amount, description, expenseDate, createdById: session.adminId },
    });
    // W13.2: audit log response ke baad.
    after(async () => {
      await logOfficeAction(session, { action: "case.expense.add", entity: "Case", entityId: id, after: expense });
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
  const expense = await prisma.caseExpense.findFirst({ where: { id: expenseId, caseId: id } });
  if (!expense) return notFound("Expense nahi mila");
  await prisma.caseExpense.delete({ where: { id: expenseId } });
  // W13.2: audit log response ke baad.
  after(async () => {
    await logOfficeAction(session, { action: "case.expense.remove", entity: "Case", entityId: id, before: expense });
  });
  return NextResponse.json(await loadCaseDetail(session, id));
}

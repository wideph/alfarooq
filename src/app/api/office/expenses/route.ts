import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parseAmount } from "@/lib/office/money";
import { addDays, cleanText, parseDateOnly, toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

// Company-level expenses (rent, utilities, etc.) — BR6 "otherExp".
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (!hasPermission(session, "office:expenses:write") && !hasPermission(session, "office:finance:read")) {
    return forbidden();
  }
  const { searchParams } = new URL(request.url);
  const from = parseDateOnly(searchParams.get("from"));
  const to = parseDateOnly(searchParams.get("to"));
  const where: Prisma.CompanyExpenseWhereInput = {};
  if (from || to) where.expenseDate = { ...(from ? { gte: from } : {}), ...(to ? { lt: addDays(to, 1) } : {}) };

  const items = await prisma.companyExpense.findMany({
    where,
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json(toJson(items));
}

export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai");
    const description = cleanText(body.description, 300);
    if (!description) return badRequest("Expense ki tafseel likhein");
    const expenseDate = parseDateOnly(body.expenseDate);
    if (!expenseDate) return badRequest("Date zaroori hai");

    const expense = await prisma.companyExpense.create({
      data: {
        amount,
        description,
        category: cleanText(body.category, 60),
        expenseDate,
        createdById: session.adminId,
      },
    });
    await logOfficeAction(session, {
      action: "company_expense.create",
      entity: "CompanyExpense",
      entityId: expense.id,
      after: expense,
    });
    return NextResponse.json(toJson(expense), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") || "";
  const existing = await prisma.companyExpense.findUnique({ where: { id } });
  if (!existing) return notFound("Expense nahi mila");
  await prisma.companyExpense.delete({ where: { id } });
  await logOfficeAction(session, {
    action: "company_expense.delete",
    entity: "CompanyExpense",
    entityId: id,
    before: existing,
  });
  return NextResponse.json({ success: true });
}

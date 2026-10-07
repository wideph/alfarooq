import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parseAmount } from "@/lib/office/money";
import { cleanText, parseDateOnly, toJson } from "@/lib/office/serializers";

// BR5 — salaries for SALARY offices' staff (company expense).
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (!hasPermission(session, "office:expenses:write") && !hasPermission(session, "office:finance:read")) {
    return forbidden();
  }
  const { searchParams } = new URL(request.url);
  const officeId = searchParams.get("officeId") || "";
  const where: Prisma.SalaryEntryWhereInput = officeId ? { bookingOfficeId: officeId } : {};
  const items = await prisma.salaryEntry.findMany({
    where,
    orderBy: [{ periodMonth: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      bookingOffice: { select: { id: true, name: true } },
      member: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(toJson(items));
}

export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const bookingOfficeId = typeof body.bookingOfficeId === "string" ? body.bookingOfficeId : "";
    const office = await prisma.bookingOffice.findUnique({ where: { id: bookingOfficeId } });
    if (!office) return notFound("Booking office nahi mila");
    if (office.type !== "SALARY") return badRequest("Salary sirf salary-based office ke staff ke liye lagti hai");

    const memberId = typeof body.memberId === "string" && body.memberId ? body.memberId : null;
    if (memberId) {
      const member = await prisma.bookingOfficeMember.findFirst({ where: { id: memberId, bookingOfficeId } });
      if (!member) return notFound("Staff member nahi mila");
    }
    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai");
    const periodMonth = typeof body.periodMonth === "string" && /^\d{4}-\d{2}$/.test(body.periodMonth) ? body.periodMonth : "";
    if (!periodMonth) return badRequest("Month YYYY-MM format mein dein");
    const paidDate = body.paidDate ? parseDateOnly(body.paidDate) : null;

    const salary = await prisma.salaryEntry.create({
      data: {
        bookingOfficeId,
        memberId,
        amount,
        periodMonth,
        paidDate,
        remarks: cleanText(body.remarks, 300),
        createdById: session.adminId,
      },
      include: {
        bookingOffice: { select: { id: true, name: true } },
        member: { select: { id: true, name: true } },
      },
    });
    await logOfficeAction(session, { action: "salary.create", entity: "SalaryEntry", entityId: salary.id, after: salary });
    return NextResponse.json(toJson(salary), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") || "";
  const existing = await prisma.salaryEntry.findUnique({ where: { id } });
  if (!existing) return notFound("Salary entry nahi mili");
  await prisma.salaryEntry.delete({ where: { id } });
  await logOfficeAction(session, { action: "salary.delete", entity: "SalaryEntry", entityId: id, before: existing });
  return NextResponse.json({ success: true });
}

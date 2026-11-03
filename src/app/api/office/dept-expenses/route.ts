import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parseAmount, toNumber } from "@/lib/office/money";
import { notifyAdmins } from "@/lib/office/notifications";
import { syncProfitShare } from "@/lib/office/profit-share";
import { cleanText, parseDateOnly, todayPakistan, toJson } from "@/lib/office/serializers";
import { hasAnyDeptCommissionPermission } from "@/lib/office/dept-commission";
import { commissionExpenseTag } from "@/lib/office/expense-deduction";
import { COURIER_EXPENSE_KIND, deptExpenseTotals, emptyDeptExpenseTotals } from "@/lib/office/dept-expenses";
import { createDeptExpenseRequest } from "@/lib/office/dept-expense-requests";

export const preferredRegion = ["sin1"];

// §W51 — department user ke kharche (courier + other) aur un ki wapsi.
// Dept user sirf apna; admin / cashier (office:ledger:read) kisi ka bhi
// (?adminId=).
// §W52 — naya kharcha pehle admin ke review mein (DeptExpenseRequest); yahan
// `courier` / `other` sirf MANZOOR shuda kharche hain (wahi hisaab mein), aur
// `reviews` = review mein / wapas kiye gaye. Manzoor kharcha sirf admin /
// cashier (office:expenses:write) hata sakta hai; user apni review wali request
// khud cancel kar sakta hai (/api/office/dept-expense-requests/[id]).

// GET ?adminId= → { totals, courier[], other[], requests[], reviews[] }
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const fullAccess = hasPermission(session, "office:ledger:read");
  const requested = new URL(request.url).searchParams.get("adminId") || session.adminId;
  if (!fullAccess && (requested !== session.adminId || !hasAnyDeptCommissionPermission(session))) {
    return forbidden();
  }
  try {
    const canAdminDelete = hasPermission(session, "office:expenses:write");
    const [courier, other, requests, reviews, totals] = await Promise.all([
      prisma.caseExpense.findMany({
        where: { paidByAdminId: requested, kind: COURIER_EXPENSE_KIND },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
        take: 200,
        select: {
          id: true,
          amount: true,
          description: true,
          expenseDate: true,
          createdAt: true,
          case: { select: { id: true, caseNumber: true, clientName: true } },
        },
      }),
      prisma.companyExpense.findMany({
        where: { paidByAdminId: requested },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
        take: 200,
        select: { id: true, amount: true, description: true, expenseDate: true, createdAt: true },
      }),
      prisma.deptPayoutRequest.findMany({
        where: { adminId: requested },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.deptExpenseRequest.findMany({
        where: { adminId: requested, status: { in: ["PENDING", "REJECTED"] } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      deptExpenseTotals([requested]),
    ]);

    const creatorIds = [...new Set(requests.map((row) => row.createdById))];
    const creators = creatorIds.length
      ? await prisma.admin.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
      : [];
    const names = Object.fromEntries(creators.map((admin) => [admin.id, admin.name]));

    return NextResponse.json(
      toJson({
        ok: true,
        adminId: requested,
        totals: totals.get(requested) ?? emptyDeptExpenseTotals(),
        courier: courier.map((row) => ({
          id: row.id,
          amount: row.amount,
          description: row.description,
          expenseDate: row.expenseDate,
          createdAt: row.createdAt,
          caseId: row.case.id,
          caseNumber: row.case.caseNumber,
          clientName: row.case.clientName || null,
          canDelete: canAdminDelete,
        })),
        other: other.map((row) => ({
          id: row.id,
          amount: row.amount,
          description: row.description,
          expenseDate: row.expenseDate,
          createdAt: row.createdAt,
          canDelete: canAdminDelete,
        })),
        requests: requests.map((row) => ({
          id: row.id,
          kind: row.kind,
          amount: row.amount,
          method: row.method,
          entryDate: row.entryDate,
          remarks: row.remarks,
          status: row.status,
          createdAt: row.createdAt,
          decidedAt: row.decidedAt,
          createdByName: names[row.createdById] || null,
        })),
        reviews: reviews.map((row) => ({
          id: row.id,
          kind: row.kind,
          caseId: row.caseId,
          caseNumber: row.caseNumber,
          amount: row.amount,
          description: row.description,
          expenseDate: row.expenseDate,
          status: row.status,
          decisionNote: row.decisionNote,
          createdAt: row.createdAt,
          decidedAt: row.decidedAt,
          canCancel: row.status === "PENDING" && row.adminId === session.adminId,
        })),
      })
    );
  } catch (error) {
    return serverError(error);
  }
}

// POST { amount, description, expenseDate? } — "Other expense" (kisi case se
// nahi): printing / attestation / courier user, comment lazmi. §W52: pehle
// admin ka review — manzoori par company expense (sirf admin ke profit se
// minus) + admin se wasooli baqi.
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (!hasAnyDeptCommissionPermission(session)) return forbidden();
  if (session.role === "admin") return badRequest("Admin ke liye ye option nahi — company expense alag hai");
  try {
    const body = await request.json().catch(() => ({}));
    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai (0 se zyada)");
    const description = cleanText(body.description, 300);
    if (!description) return badRequest("Comment lazmi hai — kis cheez ka kharcha hai?");
    const expenseDate = parseDateOnly(body.expenseDate) ?? todayPakistan();

    const review = await createDeptExpenseRequest({
      adminId: session.adminId,
      kind: "OTHER",
      amount,
      description,
      expenseDate,
    });

    after(async () => {
      await logOfficeAction(session, {
        action: "dept.expense.request",
        entity: "DeptExpenseRequest",
        entityId: review.id,
        after: { kind: "OTHER", amount, description, expenseDate },
      });
      await notifyAdmins({
        type: "dept.expense",
        title: `Review: other kharcha Rs ${toNumber(amount).toLocaleString("en-PK")} — ${session.name}`,
        body: description,
        link: "/office/payments?view=expenses",
      });
    });

    return NextResponse.json(toJson({ ok: true, pending: true, request: review }), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

// DELETE ?kind=COURIER|OTHER&id= — MANZOOR shuda kharcha hatana: sirf admin /
// cashier (office:expenses:write). (User apni review wali request cancel
// karta hai — dept-expense-requests route.)
export async function DELETE(request: NextRequest) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  const searchParams = new URL(request.url).searchParams;
  const kind = (searchParams.get("kind") || "").toUpperCase();
  const id = searchParams.get("id") || "";
  try {
    if (kind === "COURIER") {
      const expense = await prisma.caseExpense.findFirst({
        where: { id, kind: COURIER_EXPENSE_KIND, paidByAdminId: { not: null } },
      });
      if (!expense) return notFound("Kharcha nahi mila");
      await prisma.$transaction(async (tx) => {
        await tx.ledgerEntry.deleteMany({
          where: { caseId: expense.caseId, type: "EXPENSE", remarks: { startsWith: `${commissionExpenseTag(expense.id)}:` } },
        });
        await tx.caseExpense.delete({ where: { id: expense.id } });
      }, { maxWait: 10000, timeout: 30000 });
      after(async () => {
        await logOfficeAction(session, {
          action: "case.expense.courier.remove",
          entity: "Case",
          entityId: expense.caseId,
          before: expense,
        });
        await syncProfitShare(expense.caseId, session.adminId);
      });
      return NextResponse.json({ ok: true });
    }

    if (kind === "OTHER") {
      const expense = await prisma.companyExpense.findFirst({ where: { id, paidByAdminId: { not: null } } });
      if (!expense) return notFound("Kharcha nahi mila");
      await prisma.companyExpense.delete({ where: { id: expense.id } });
      after(async () => {
        await logOfficeAction(session, {
          action: "dept.expense.other.remove",
          entity: "CompanyExpense",
          entityId: expense.id,
          before: expense,
        });
      });
      return NextResponse.json({ ok: true });
    }

    return badRequest("Kharche ki qism sahi nahi hai");
  } catch (error) {
    return serverError(error);
  }
}

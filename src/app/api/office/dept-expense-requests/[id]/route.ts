import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { notifyUsers } from "@/lib/office/notifications";
import { parseAmount, toNumber } from "@/lib/office/money";
import { syncProfitShare } from "@/lib/office/profit-share";
import { cleanText, toJson } from "@/lib/office/serializers";
import { acceptDeptExpenseRequest, DeptExpenseDecidedError } from "@/lib/office/dept-expense-requests";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

const KIND_LABEL: Record<string, string> = { COURIER: "Courier kharcha", OTHER: "Other kharcha" };

// §W52 — POST { action, amount?, note? }
//   accept (super admin): asal kharcha banta hai (§W51 nizam) — admin raqam
//     theek kar sakta hai (amount). User ko notification.
//   reject (super admin): kuch nahi banta; wajah (note) user ko.
//   cancel (wahi user, sirf PENDING): request hat jati hai (ghalti thi).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  if (!["accept", "reject", "cancel"].includes(action)) return badRequest("Action sahi nahi hai");

  try {
    const review = await prisma.deptExpenseRequest.findUnique({ where: { id } });
    if (!review) return notFound("Kharcha nahi mila");
    const label = KIND_LABEL[review.kind] || "Kharcha";
    const where = review.caseNumber ? ` — Case ${review.caseNumber}` : "";

    if (action === "cancel") {
      if (review.adminId !== session.adminId) return forbidden("Sirf apna bheja hua kharcha cancel ho sakta hai");
      const removed = await prisma.deptExpenseRequest.deleteMany({ where: { id, status: "PENDING" } });
      if (removed.count === 0) return badRequest("Admin is kharche ka faisla kar chuka — ab cancel nahi ho sakta");
      after(async () => {
        await logOfficeAction(session, {
          action: "dept.expense.request.cancel",
          entity: "DeptExpenseRequest",
          entityId: id,
          before: review,
        });
      });
      return NextResponse.json({ ok: true });
    }

    if (session.role !== "admin") return forbidden("Kharche ka faisla sirf admin karta hai");
    const note = cleanText(body.note, 300);

    if (action === "accept") {
      const amount =
        body.amount === undefined || body.amount === null || body.amount === ""
          ? null
          : parseAmount(body.amount, { allowZero: false });
      if (body.amount !== undefined && body.amount !== null && body.amount !== "" && amount === null) {
        return badRequest("Raqam sahi nahi hai (0 se zyada)");
      }
      let result;
      try {
        result = await acceptDeptExpenseRequest(id, session, { amount, note });
      } catch (error) {
        if (error instanceof DeptExpenseDecidedError) return badRequest(error.message);
        throw error;
      }
      const finalAmount = toNumber(result.request.amount);
      after(async () => {
        await logOfficeAction(session, {
          action: "dept.expense.accept",
          entity: "DeptExpenseRequest",
          entityId: id,
          before: { status: "PENDING", amount: result.before.amount },
          after: result.request,
        });
        // Partner office ka case → pool dobara (shares % ke mutabiq minus).
        if (result.caseId) await syncProfitShare(result.caseId, session.adminId);
        await notifyUsers([review.adminId], {
          type: "request.decided",
          title: `${label} manzoor: Rs ${finalAmount.toLocaleString("en-PK")}${where}`,
          body: result.request.requestedAmount
            ? `Aap ne Rs ${toNumber(result.request.requestedAmount).toLocaleString("en-PK")} bheja tha — admin ne Rs ${finalAmount.toLocaleString("en-PK")} manzoor kiya${note ? ` (${note})` : ""}`
            : note,
          link: "/office/finance",
        });
      });
      return NextResponse.json(toJson({ ok: true, request: result.request }));
    }

    // action === "reject"
    const updated = await prisma.deptExpenseRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", decisionNote: note, decidedById: session.adminId, decidedAt: new Date() },
    });
    if (updated.count === 0) return badRequest("Ye kharcha pehle hi decide ho chuka");
    after(async () => {
      await logOfficeAction(session, {
        action: "dept.expense.reject",
        entity: "DeptExpenseRequest",
        entityId: id,
        before: { status: "PENDING" },
        after: { status: "REJECTED", decisionNote: note },
      });
      await notifyUsers([review.adminId], {
        type: "request.decided",
        title: `${label} wapas: Rs ${toNumber(review.amount).toLocaleString("en-PK")}${where}`,
        body: note ? `Wajah: ${note}` : "Admin ne manzoor nahi kiya",
        link: "/office/finance",
      });
    });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  } catch (error) {
    return serverError(error);
  }
}

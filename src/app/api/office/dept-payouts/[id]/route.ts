import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { notifyUsers } from "@/lib/office/notifications";
import { toNumber } from "@/lib/office/money";
import { toJson } from "@/lib/office/serializers";
import { getOfficeDirectory } from "@/lib/office/setup-cache";
import { DEPT_COMMISSION_TYPE } from "@/lib/office/dept-commission";
import { DEPT_PAYOUT_KIND_LABELS } from "@/lib/office/labels";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// §W51 — POST { action: "accept" | "reject" }
// accept: SIRF wo user jis ko payment mili (ya super admin) — ACCEPTED. Commission
//   ki request par usi transaction mein PAYOUT DEBIT ledger row (adminId = user;
//   pehle wala direct payout jaisa — earned / paid / remaining wahi hisaab).
//   Kharchon ki wapsi ledger mein nahi (status ACCEPTED hi "paid" hai).
// reject: user khud (paisa nahi mila) ya admin / cashier (office:ledger:write —
//   request cancel). Kuch count nahi hota.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  if (action !== "accept" && action !== "reject") return badRequest("Action sahi nahi hai");

  try {
    const payout = await prisma.deptPayoutRequest.findUnique({ where: { id } });
    if (!payout) return notFound("Payment request nahi mili");
    const isReceiver = payout.adminId === session.adminId;
    const label = DEPT_PAYOUT_KIND_LABELS[payout.kind] || payout.kind;

    if (action === "accept") {
      if (!isReceiver && session.role !== "admin") {
        return forbidden("Payment sirf wahi user accept kar sakta hai jis ko mili");
      }
      if (payout.status !== "PENDING") return badRequest("Request pehle se decide ho chuki");

      // Commission payout ledger row ko booking office chahiye: user ki aakhri
      // DEPT_COMMISSION entry ka office → pehla active office (purana payout
      // route jaisa).
      let bookingOfficeId = "";
      if (payout.kind === "COMMISSION") {
        const lastCredit = await prisma.ledgerEntry.findFirst({
          where: { type: DEPT_COMMISSION_TYPE, adminId: payout.adminId },
          orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
          select: { bookingOfficeId: true },
        });
        bookingOfficeId = lastCredit?.bookingOfficeId ?? "";
        if (!bookingOfficeId) {
          const offices = await getOfficeDirectory();
          bookingOfficeId = offices.find((office) => office.isActive)?.id ?? offices[0]?.id ?? "";
        }
        if (!bookingOfficeId) return badRequest("Koi booking office nahi mila — payout book nahi ho sakta");
      }

      let updated;
      try {
        updated = await prisma.$transaction(async (tx) => {
          const fresh = await tx.deptPayoutRequest.findUnique({ where: { id }, select: { status: true } });
          if (!fresh || fresh.status !== "PENDING") throw new Error("ALREADY_DECIDED");
          let ledgerEntryId: string | null = null;
          if (payout.kind === "COMMISSION") {
            const entry = await tx.ledgerEntry.create({
              data: {
                bookingOfficeId,
                memberId: null,
                adminId: payout.adminId,
                caseId: null,
                type: "PAYOUT",
                direction: "DEBIT",
                amount: payout.amount,
                entryDate: payout.entryDate,
                method: payout.method,
                remarks: payout.remarks,
                createdById: payout.createdById,
              },
            });
            ledgerEntryId = entry.id;
          }
          return tx.deptPayoutRequest.update({
            where: { id },
            data: { status: "ACCEPTED", ledgerEntryId, decidedById: session.adminId, decidedAt: new Date() },
          });
        }, { maxWait: 10000, timeout: 30000 });
      } catch (error) {
        if (error instanceof Error && error.message === "ALREADY_DECIDED") {
          return badRequest("Request pehle se decide ho chuki");
        }
        throw error;
      }

      after(async () => {
        await logOfficeAction(session, {
          action: "dept-payout.accept",
          entity: "DeptPayoutRequest",
          entityId: id,
          before: { status: payout.status },
          after: updated,
        });
        await notifyUsers([payout.createdById], {
          type: "request.decided",
          title: `${label} ki payment accept ho gayi: Rs ${toNumber(payout.amount).toLocaleString("en-PK")}`,
          link: "/office/finance",
        });
      });
      return NextResponse.json(toJson(updated));
    }

    // action === "reject"
    if (!isReceiver && !hasPermission(session, "office:ledger:write")) {
      return forbidden("Payment request reject ki permission nahi hai");
    }
    if (payout.status !== "PENDING") return badRequest("Request pehle se decide ho chuki");
    const updated = await prisma.deptPayoutRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", decidedById: session.adminId, decidedAt: new Date() },
    });
    if (updated.count === 0) return badRequest("Request pehle se decide ho chuki");

    after(async () => {
      await logOfficeAction(session, {
        action: "dept-payout.reject",
        entity: "DeptPayoutRequest",
        entityId: id,
        before: { status: payout.status },
        after: { status: "REJECTED" },
      });
      // User ne reject ki → admin ko; admin ne cancel ki → user ko.
      await notifyUsers([isReceiver ? payout.createdById : payout.adminId], {
        type: "request.decided",
        title: isReceiver
          ? `${label} ki payment reject hui: Rs ${toNumber(payout.amount).toLocaleString("en-PK")}`
          : `${label} ki payment request cancel: Rs ${toNumber(payout.amount).toLocaleString("en-PK")}`,
        link: "/office/finance",
      });
    });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  } catch (error) {
    return serverError(error);
  }
}

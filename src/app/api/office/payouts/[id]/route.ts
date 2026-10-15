import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { notifyUsers } from "@/lib/office/notifications";
import { toNumber } from "@/lib/office/money";
import { toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

const payoutInclude = {
  bookingOffice: { select: { id: true, name: true } },
  member: { select: { id: true, name: true, adminId: true } },
} as const;

// §W14.5 — POST { action: "accept" | "reject" }
// accept: SIRF member ka linked admin user (ya super admin) — ek hi tx mein
//   PAYOUT DEBIT ledger entry + request ACCEPTED (ledgerEntryId + decided fields).
// reject: member ka linked admin YA admin/cashier (office:ledger:write) —
//   sirf status REJECTED (ledger untouched).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  if (action !== "accept" && action !== "reject") return badRequest("Action sahi nahi hai");

  if (action === "accept") {
    // Linked admin user ka role booking_office hota hai — pehle kisi bhi office
    // user ko andar aane do, phir linked-admin check khud lagate hain.
    const { session, denied } = await guardOffice("office:cases:read");
    if (denied) return denied;
    try {
      const payout = await prisma.payoutRequest.findUnique({
        where: { id },
        include: payoutInclude,
      });
      if (!payout) return notFound("Payout request nahi mili");
      const isLinkedAdmin = Boolean(payout.member.adminId) && payout.member.adminId === session.adminId;
      if (!isLinkedAdmin && session.role !== "admin") {
        return forbidden("Payout sirf member ka linked user accept kar sakta hai");
      }
      if (payout.status !== "PENDING") return badRequest("Request pehle se decide ho chuki");

      let updated;
      try {
        updated = await prisma.$transaction(
          async (tx) => {
            // Race-safe guard: tx ke andar dobara status check.
            const fresh = await tx.payoutRequest.findUnique({ where: { id }, select: { status: true } });
            if (!fresh || fresh.status !== "PENDING") throw new Error("ALREADY_DECIDED");
            const entry = await tx.ledgerEntry.create({
              data: {
                bookingOfficeId: payout.bookingOfficeId,
                memberId: payout.memberId,
                type: "PAYOUT",
                direction: "DEBIT",
                amount: payout.amount,
                entryDate: payout.entryDate,
                method: payout.method,
                remarks: `Payout accept — ${payout.remarks || ""}`.trim(),
                createdById: session.adminId,
              },
            });
            return tx.payoutRequest.update({
              where: { id },
              data: {
                status: "ACCEPTED",
                ledgerEntryId: entry.id,
                decidedById: session.adminId,
                decidedAt: new Date(),
              },
              include: payoutInclude,
            });
          },
          { maxWait: 10000, timeout: 30000 }
        );
      } catch (error) {
        if (error instanceof Error && error.message === "ALREADY_DECIDED") {
          return badRequest("Request pehle se decide ho chuki");
        }
        throw error;
      }

      after(async () => {
        await logOfficeAction(session, {
          action: "payout.accept",
          entity: "PayoutRequest",
          entityId: id,
          before: { status: payout.status },
          after: updated,
        });
        // Request creator ko notify (wo linked admin nahi bhi ho sakta).
        await notifyUsers([payout.createdById], {
          type: "request.decided",
          title: `Payout accept ho gaya: Rs ${toNumber(payout.amount)}`,
          link: "/office/finance",
        });
      });

      return NextResponse.json(toJson(updated));
    } catch (error) {
      return serverError(error);
    }
  }

  // action === "reject"
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  try {
    const payout = await prisma.payoutRequest.findUnique({
      where: { id },
      include: payoutInclude,
    });
    if (!payout) return notFound("Payout request nahi mili");
    const isLinkedAdmin = Boolean(payout.member.adminId) && payout.member.adminId === session.adminId;
    if (!isLinkedAdmin && !hasPermission(session, "office:ledger:write")) {
      return forbidden("Payout reject ki permission nahi hai");
    }
    if (payout.status !== "PENDING") return badRequest("Request pehle se decide ho chuki");

    const updated = await prisma.payoutRequest.update({
      where: { id },
      data: { status: "REJECTED", decidedById: session.adminId, decidedAt: new Date() },
      include: payoutInclude,
    });

    after(async () => {
      await logOfficeAction(session, {
        action: "payout.reject",
        entity: "PayoutRequest",
        entityId: id,
        before: { status: payout.status },
        after: updated,
      });
      await notifyUsers([payout.createdById], {
        type: "request.decided",
        title: `Payout reject hui: Rs ${toNumber(payout.amount)}`,
        link: "/office/finance",
      });
    });

    return NextResponse.json(toJson(updated));
  } catch (error) {
    return serverError(error);
  }
}

import { NextRequest, NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { notifyUsers } from "@/lib/office/notifications";
import { parseAmount, toNumber } from "@/lib/office/money";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/office/permissions";
import { cleanText, parseDateOnly, toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

// §W14.5 — shareholder payout REQUEST flow. Yahan sirf PENDING request banti
// hai (koi ledger row nahi); member ka linked admin user /api/office/payouts/[id]
// par accept kare to PAYOUT DEBIT entry lagti hai, reject ho to kuch nahi.

const PAYOUT_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"];

// GET ?status=&memberId=&bookingOfficeId= — admin/cashier (office:ledger:read)
// sab kuch dekhte hain; booking_office login sirf apni office ki requests.
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const isBookingOffice = session.role === "booking_office";
  if (!isBookingOffice && !hasPermission(session, "office:ledger:read")) return forbidden();

  const { searchParams } = new URL(request.url);
  const where: Prisma.PayoutRequestWhereInput = {};
  if (isBookingOffice) {
    where.bookingOfficeId = session.bookingOfficeId || "__none__";
  } else {
    const bookingOfficeId = searchParams.get("bookingOfficeId") || "";
    if (bookingOfficeId) where.bookingOfficeId = bookingOfficeId;
  }
  const status = (searchParams.get("status") || "").toUpperCase();
  if (PAYOUT_STATUSES.includes(status)) where.status = status;
  const memberId = searchParams.get("memberId") || "";
  if (memberId) where.memberId = memberId;

  const items = await prisma.payoutRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      bookingOffice: { select: { id: true, name: true } },
      member: { select: { id: true, name: true, adminId: true } },
    },
  });

  // Creator/decider names (PayoutRequest par Admin relation nahi — ek names map).
  const ids = [
    ...new Set(
      items.flatMap((p) => [p.createdById, p.decidedById]).filter((id): id is string => Boolean(id))
    ),
  ];
  const admins = ids.length
    ? await prisma.admin.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const names = Object.fromEntries(admins.map((admin) => [admin.id, admin.name]));

  return NextResponse.json(
    toJson(
      items.map((p) => ({
        ...p,
        createdByName: names[p.createdById] || null,
        decidedByName: p.decidedById ? names[p.decidedById] || null : null,
      }))
    )
  );
}

// POST { bookingOfficeId, memberId, amount, method?, entryDate, remarks? }
// (office:ledger:write) → PENDING request + member ke linked admin ko notify.
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:ledger:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const bookingOfficeId = typeof body.bookingOfficeId === "string" ? body.bookingOfficeId : "";
    const office = await prisma.bookingOffice.findUnique({ where: { id: bookingOfficeId } });
    if (!office) return notFound("Booking office nahi mila");

    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    const member = await prisma.bookingOfficeMember.findFirst({
      where: { id: memberId, bookingOfficeId },
    });
    if (!member) return badRequest("Member is office ka nahi hai");

    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai");
    const entryDate = parseDateOnly(body.entryDate);
    if (!entryDate) return badRequest("Date zaroori hai");
    const method = String(body.method || "CASH") as PaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) return badRequest("Method sahi nahi hai");
    const remarks = cleanText(body.remarks, 500);

    const payout = await prisma.payoutRequest.create({
      data: {
        bookingOfficeId,
        memberId: member.id,
        amount,
        method,
        entryDate,
        remarks,
        status: "PENDING",
        createdById: session.adminId,
      },
      include: {
        bookingOffice: { select: { id: true, name: true } },
        member: { select: { id: true, name: true, adminId: true } },
      },
    });

    // Audit + notification response ke baad (W13.2 pattern).
    after(async () => {
      await logOfficeAction(session, {
        action: "payout.request",
        entity: "PayoutRequest",
        entityId: payout.id,
        after: payout,
      });
      // §W14.5: member ka linked admin user hi accept/reject karega — usi ko notify.
      if (payout.member.adminId) {
        await notifyUsers([payout.member.adminId], {
          type: "request",
          title: `Payout request: Rs ${toNumber(amount)}`,
          body: remarks,
          link: "/office/finance",
        });
      }
    });

    return NextResponse.json(toJson(payout), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

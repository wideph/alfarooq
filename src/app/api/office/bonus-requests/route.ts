import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission, type AdminSession } from "@/lib/auth";
import { badRequest, DEPT_WORKER_MONEY_DENIED, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { isDeptWorker } from "@/lib/office/case-access";
import { logOfficeAction } from "@/lib/office/audit";
import { notifyAdmins, notifyUsers } from "@/lib/office/notifications";
import { parseAmount } from "@/lib/office/money";
import { caseCommissionMemberId } from "@/lib/office/commission";
import { cleanText, todayPakistan, toJson } from "@/lib/office/serializers";
import { findCachedOffice } from "@/lib/office/setup-cache";

export const preferredRegion = ["sin1"];

const BONUS_DEDUCT_OPTIONS = ["COMMISSION", "PROFIT"] as const;

function canDecide(session: AdminSession) {
  return session.role === "admin" || hasPermission(session, "office:payments:verify");
}

// GET — admin / cashier see everything; a booking office sees its own requests.
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  // §W36: printing / attestation / courier worker ko raqam ki maloomat nahi.
  if (isDeptWorker(session)) return forbidden(DEPT_WORKER_MONEY_DENIED);

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") || "").toUpperCase();

  const where: Record<string, unknown> = {};
  if (status && ["PENDING", "ACCEPTED", "REJECTED"].includes(status)) where.status = status;
  if (!canDecide(session)) {
    if (session.role !== "booking_office") return forbidden();
    where.bookingOfficeId = session.bookingOfficeId || "__none__";
  }

  const items = await prisma.bonusRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      bookingOffice: { select: { id: true, name: true } },
      case: { select: { id: true, caseNumber: true, clientName: true } },
    },
  });
  return NextResponse.json(toJson({ items }));
}

// POST { bookingOfficeId?, caseId?, amount, reason } — a booking office
// requests a bonus for itself; admin may create for any office (§N8).
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const bookingOfficeId =
      session.role === "booking_office"
        ? session.bookingOfficeId || ""
        : typeof body.bookingOfficeId === "string"
          ? body.bookingOfficeId
          : "";
    if (!bookingOfficeId) return badRequest("Booking office select karein");
    const caseId = typeof body.caseId === "string" && body.caseId ? body.caseId : null;
    // §W20: office cached directory se; case link check parallel (independent).
    const [office, linked] = await Promise.all([
      findCachedOffice(bookingOfficeId),
      caseId
        ? prisma.case.findFirst({ where: { id: caseId, bookingOfficeId }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (!office || !office.isActive) return badRequest("Booking office nahi mila ya inactive hai");

    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai");

    if (caseId && !linked) return badRequest("Case is booking office ka nahi hai");

    const created = await prisma.bonusRequest.create({
      data: {
        bookingOfficeId,
        caseId,
        amount,
        reason: cleanText(body.reason, 500),
        createdById: session.adminId,
      },
    });

    // W13.2: audit log + admin notification response ke baad.
    after(async () => {
      await logOfficeAction(session, {
        action: "bonus.request",
        entity: "BonusRequest",
        entityId: created.id,
        after: { bookingOfficeId, caseId, amount, reason: created.reason },
      });

      // §W11.8 — nayi bonus request par admins ko notification.
      await notifyAdmins({
        type: "request",
        title: `Bonus request: ${office.name}`,
        body: created.reason || null,
        link: caseId ? `/office/cases/${caseId}` : null,
      });
    });

    return NextResponse.json(toJson(created), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

// PATCH { id, action: ACCEPT | REJECT, deductFrom: COMMISSION | PROFIT } —
// admin / cashier decide. ACCEPT credits the office ledger (type BONUS); the
// deductFrom choice records whether the company funds it from the office's
// commission pot or from admin profit (noted on the ledger row + request).
export async function PATCH(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (!canDecide(session)) return forbidden("Bonus sirf admin / cashier decide karein");

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const action = String(body.action || "").toUpperCase();
    if (!["ACCEPT", "REJECT"].includes(action)) return badRequest("Action sahi nahi hai");

    const existing = await prisma.bonusRequest.findUnique({ where: { id } });
    if (!existing) return notFound("Bonus request nahi mili");
    if (existing.status !== "PENDING") return badRequest("Ye request pehle se decide ho chuki hai");

    if (action === "REJECT") {
      const updated = await prisma.bonusRequest.update({
        where: { id },
        data: { status: "REJECTED", decidedById: session.adminId, decidedAt: new Date() },
      });
      // W13.2: audit log + requester notification response ke baad.
      after(async () => {
        await logOfficeAction(session, {
          action: "bonus.reject",
          entity: "BonusRequest",
          entityId: id,
          before: existing,
          after: { status: "REJECTED" },
        });
        // §W11.8 — decision par requester ko notification.
        await notifyUsers([existing.createdById], {
          type: "request.decided",
          title: "Bonus request reject ho gayi",
          body: existing.reason || null,
          link: existing.caseId ? `/office/cases/${existing.caseId}` : null,
        });
      });
      return NextResponse.json(toJson(updated));
    }

    const deductFrom = String(body.deductFrom || "").toUpperCase();
    if (!(BONUS_DEDUCT_OPTIONS as readonly string[]).includes(deductFrom)) {
      return badRequest("deductFrom zaroori hai (COMMISSION | PROFIT)");
    }

    // §W45: bonus member ki earning hai (BONUS finance users / dashboard ke
    // EARNING_TYPES mein) — is liye ledger row member par: request karne wala
    // member, warna case ka commission member, warna office ka akela active
    // member. Pehle memberId khali jata tha → member ke account / due mein
    // bonus nazar hi nahi aata tha.
    const [members, linkedCase] = await Promise.all([
      prisma.bookingOfficeMember.findMany({
        where: { bookingOfficeId: existing.bookingOfficeId },
        select: { id: true, adminId: true, isActive: true },
      }),
      existing.caseId
        ? prisma.case.findUnique({
            where: { id: existing.caseId },
            select: { commissionMemberId: true, createdByAdminId: true },
          })
        : Promise.resolve(null),
    ]);
    const activeMembers = members.filter((member) => member.isActive);
    const bonusMemberId =
      members.find((member) => member.adminId === existing.createdById)?.id ??
      (linkedCase ? caseCommissionMemberId(linkedCase, members) : null) ??
      (activeMembers.length === 1 ? activeMembers[0].id : null);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.bonusRequest.update({
        where: { id },
        data: { status: "ACCEPTED", deductFrom, decidedById: session.adminId, decidedAt: new Date() },
      });
      await tx.ledgerEntry.create({
        data: {
          bookingOfficeId: existing.bookingOfficeId,
          memberId: bonusMemberId,
          caseId: existing.caseId,
          type: "BONUS",
          direction: "CREDIT",
          amount: existing.amount,
          entryDate: todayPakistan(),
          remarks: `Bonus accept (${deductFrom === "COMMISSION" ? "commission se" : "admin profit se"})${existing.reason ? `: ${existing.reason}` : ""}`,
          createdById: session.adminId,
        },
      });
      return row;
    }, { maxWait: 10000, timeout: 30000 });

    // W13.2: audit log + requester notification response ke baad.
    after(async () => {
      await logOfficeAction(session, {
        action: "bonus.accept",
        entity: "BonusRequest",
        entityId: id,
        before: existing,
        after: { status: "ACCEPTED", deductFrom, amount: existing.amount },
      });
      // §W11.8 — decision par requester ko notification.
      await notifyUsers([existing.createdById], {
        type: "request.decided",
        title: "Bonus request accept ho gayi",
        body: existing.reason || null,
        link: existing.caseId ? `/office/cases/${existing.caseId}` : null,
      });
    });

    return NextResponse.json(toJson(updated));
  } catch (error) {
    return serverError(error);
  }
}

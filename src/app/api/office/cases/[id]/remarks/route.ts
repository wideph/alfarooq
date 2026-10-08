import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { cleanText, toJson } from "@/lib/office/serializers";
import {
  allowedRemarkTargets,
  REMARK_TARGETS,
  roleToRemarkTarget,
  type RemarkTarget,
} from "@/lib/office/workflow";

type RouteParams = { params: Promise<{ id: string }> };

async function creatorNames(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {} as Record<string, string>;
  const admins = await prisma.admin.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(admins.map((admin) => [admin.id, admin.name]));
}

// GET: remarks visible to the caller — admin sees all; everyone else sees
// remarks aimed at their department or written by themselves. Includes
// per-target recipient rows (id + seenAt) so the UI can mark seen.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");

    const target = roleToRemarkTarget(session.role);
    const isAdmin = session.role === "admin";
    const remarks = await prisma.caseRemark.findMany({
      where: isAdmin
        ? { caseId: id }
        : {
            caseId: id,
            OR: [
              { createdById: session.adminId },
              ...(target ? [{ recipients: { some: { target } } }] : []),
            ],
          },
      orderBy: { createdAt: "asc" },
      include: { recipients: true },
    });

    const names = await creatorNames(remarks.map((remark) => remark.createdById));
    const hasUnseenWarning = target
      ? remarks.some((remark) =>
          remark.recipients.some((recipient) => recipient.target === target && !recipient.seenAt)
        )
      : false;

    return NextResponse.json(
      toJson({
        items: remarks.map((remark) => ({
          id: remark.id,
          text: remark.text,
          createdById: remark.createdById,
          createdByRole: remark.createdByRole,
          createdByName: names[remark.createdById] || null,
          createdAt: remark.createdAt,
          mine: remark.createdById === session.adminId,
          targets: remark.recipients.map((recipient) => ({
            recipientId: recipient.id,
            target: recipient.target,
            seenAt: recipient.seenAt,
            forMe: target === recipient.target,
          })),
        })),
        hasUnseenWarning,
      })
    );
  } catch (error) {
    return serverError(error);
  }
}

// POST { text, targets[] } — office:remarks:write. Target lists are limited by
// role (§N7): booking → ADMIN/ATTA/PRINTING, filing → ADMIN/BOOKING/PRINTING,
// printing/atta/courier → any, admin → any.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:remarks:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");

    const body = await request.json();
    const text = cleanText(body.text, 1000);
    if (!text) return badRequest("Remark text zaroori hai");

    const targets: string[] = Array.isArray(body.targets)
      ? [...new Set((body.targets as unknown[]).filter((t): t is string => typeof t === "string"))]
      : [];
    if (targets.length === 0) return badRequest("Kam az kam ek recipient select karein");
    const invalid = targets.filter((t) => !(REMARK_TARGETS as readonly string[]).includes(t));
    if (invalid.length > 0) return badRequest("Recipient sahi nahi hai");

    const allowed = allowedRemarkTargets(session.role);
    const notAllowed = targets.filter((t) => !allowed.includes(t as RemarkTarget));
    if (notAllowed.length > 0) {
      return forbidden("Aap in departments ko remark nahi bhej sakte");
    }

    const remark = await prisma.caseRemark.create({
      data: {
        caseId: id,
        text,
        createdById: session.adminId,
        createdByRole: session.role || "unknown",
        recipients: { create: targets.map((target) => ({ target })) },
      },
      include: { recipients: true },
    });

    await logOfficeAction(session, {
      action: "case.remark.create",
      entity: "Case",
      entityId: id,
      after: { remarkId: remark.id, targets, text },
    });

    return NextResponse.json(
      toJson({
        id: remark.id,
        text: remark.text,
        createdByRole: remark.createdByRole,
        createdAt: remark.createdAt,
        targets: remark.recipients.map((recipient) => ({
          recipientId: recipient.id,
          target: recipient.target,
          seenAt: recipient.seenAt,
        })),
      }),
      { status: 201 }
    );
  } catch (error) {
    return serverError(error);
  }
}

// PATCH { recipientId } — mark a remark as seen by the caller's department.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");

    const body = await request.json();
    const recipientId = typeof body.recipientId === "string" ? body.recipientId : "";
    const recipient = await prisma.caseRemarkRecipient.findFirst({
      where: { id: recipientId, remark: { caseId: id } },
    });
    if (!recipient) return notFound("Remark nahi mila");

    const target = roleToRemarkTarget(session.role);
    if (session.role !== "admin" && recipient.target !== target) {
      return forbidden("Ye remark aap ke department ke liye nahi hai");
    }

    const updated = await prisma.caseRemarkRecipient.update({
      where: { id: recipient.id },
      data: { seenAt: recipient.seenAt || new Date() },
    });
    return NextResponse.json(toJson({ recipientId: updated.id, seenAt: updated.seenAt }));
  } catch (error) {
    return serverError(error);
  }
}

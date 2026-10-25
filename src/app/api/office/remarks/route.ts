import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardOffice, serverError } from "@/lib/office/guard";
import { remarkInboxWhere, remarkTargetsForSession } from "@/lib/office/remark-inbox";
import { toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

// §W32 — GET: user ka Remarks tab. Tamam cases ke woh remarks jo is user ke
// liye bheje gaye (role / department targets) aur jo is ne abhi "Done" nahi
// kiye — har remark ke saath case ki pehchan (student naam, Roll, Reg, Online
// Verification #). Newest pehle.
export async function GET() {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  try {
    const targets = remarkTargetsForSession(session);
    const where = remarkInboxWhere(session);
    if (!where) return NextResponse.json({ items: [], count: 0, targets });

    const [remarks, count] = await Promise.all([
      prisma.caseRemark.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 300,
        include: {
          recipients: { select: { target: true, seenAt: true } },
          case: {
            select: {
              id: true,
              caseNumber: true,
              clientName: true,
              rollNumber: true,
              registrationNumber: true,
              onlineVerificationNumber: true,
              status: true,
            },
          },
        },
      }),
      prisma.caseRemark.count({ where }),
    ]);

    const creatorIds = [...new Set(remarks.map((remark) => remark.createdById))];
    const creators = creatorIds.length
      ? await prisma.admin.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(creators.map((creator) => [creator.id, creator.name]));
    const mine = new Set<string>(targets);

    return NextResponse.json(
      toJson({
        count,
        targets,
        items: remarks.map((remark) => ({
          id: remark.id,
          text: remark.text,
          createdAt: remark.createdAt,
          createdByName: names.get(remark.createdById) ?? null,
          createdByRole: remark.createdByRole,
          // Is user ke kaun se targets par aaya (chips).
          forTargets: remark.recipients.filter((recipient) => mine.has(recipient.target)).map((recipient) => recipient.target),
          case: remark.case,
        })),
      })
    );
  } catch (error) {
    return serverError(error);
  }
}

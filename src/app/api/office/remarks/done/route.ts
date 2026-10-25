import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { remarkInboxCount, remarkInboxWhere, remarkTargetsForSession } from "@/lib/office/remark-inbox";

export const preferredRegion = ["sin1"];

// §W32 — POST { remarkIds: [] } ya { all: true }: user in remarks ko apne
// Remarks tab se "Done" karta hai (sirf is user ke liye — doosre users ke tab
// par asar nahi). Done ke saath user ke targets par seenAt bhi lag jata hai
// (case page ki warning bhi khatam).
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => null)) as { remarkIds?: unknown; all?: unknown } | null;
    const where = remarkInboxWhere(session);
    if (!where) return NextResponse.json({ ok: true, done: 0, count: 0 });

    let ids: string[];
    if (body?.all === true) {
      ids = (await prisma.caseRemark.findMany({ where, select: { id: true } })).map((row) => row.id);
    } else {
      const requested = Array.isArray(body?.remarkIds)
        ? [...new Set((body.remarkIds as unknown[]).filter((id): id is string => typeof id === "string"))]
        : [];
      if (requested.length === 0) return badRequest("Koi remark select nahi kiya");
      // Sirf woh remarks jo waqai is user ke inbox mein hain.
      ids = (
        await prisma.caseRemark.findMany({ where: { AND: [where, { id: { in: requested } }] }, select: { id: true } })
      ).map((row) => row.id);
    }

    if (ids.length > 0) {
      const targets = remarkTargetsForSession(session);
      const now = new Date();
      await prisma.$transaction([
        prisma.caseRemarkDone.createMany({
          data: ids.map((remarkId) => ({ remarkId, adminId: session.adminId, doneAt: now })),
          skipDuplicates: true,
        }),
        prisma.caseRemarkRecipient.updateMany({
          where: { remarkId: { in: ids }, target: { in: targets }, seenAt: null },
          data: { seenAt: now },
        }),
      ]);
      after(async () => {
        await logOfficeAction(session, {
          action: "case.remark.done",
          entity: "CaseRemark",
          entityId: ids.length === 1 ? ids[0] : `${ids.length} remarks`,
          after: { remarkIds: ids },
        });
      });
    }

    return NextResponse.json({ ok: true, done: ids.length, count: await remarkInboxCount(session) });
  } catch (error) {
    return serverError(error);
  }
}

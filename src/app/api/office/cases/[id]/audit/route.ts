import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { findAccessibleCase } from "@/lib/office/case-access";
import { toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// §W11.3/W11.5: case ki audit history ab detail payload ka hissa nahi — History
// tab is lazy endpoint se fetch karta hai. Admin-only; case + uski payments ke
// latest 50 OfficeAuditLog rows, actor names ke saath.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (session.role !== "admin") return forbidden("History sirf super admin dekh sakta hai");
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id, {
      payments: { select: { id: true } },
    });
    if (!item) return notFound("Case nahi mila");

    const audit = await prisma.officeAuditLog.findMany({
      where: {
        OR: [
          { entity: "Case", entityId: id },
          { entity: "Payment", entityId: { in: item.payments.map((p) => p.id) } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const actorIds = [...new Set(audit.map((a) => a.actorId))];
    const actors = await prisma.admin.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    });
    const names = Object.fromEntries(actors.map((actor) => [actor.id, actor.name]));

    return NextResponse.json(
      toJson({ items: audit.map((a) => ({ ...a, actorName: names[a.actorId] || null })) })
    );
  } catch (error) {
    return serverError(error);
  }
}

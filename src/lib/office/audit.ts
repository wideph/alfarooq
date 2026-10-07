import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";
import { toJson } from "@/lib/office/serializers";

type Db = Prisma.TransactionClient | typeof prisma;

// Every mutating office API records who did what (docs BR9). Never throws:
// an audit failure must not roll back the business write.
export async function logOfficeAction(
  session: AdminSession,
  input: {
    action: string;
    entity: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
  db: Db = prisma
) {
  try {
    await db.officeAuditLog.create({
      data: {
        actorId: session.adminId,
        actorRole: session.role || "unknown",
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        before: input.before === undefined ? undefined : (toJson(input.before) as Prisma.InputJsonValue),
        after: input.after === undefined ? undefined : (toJson(input.after) as Prisma.InputJsonValue),
      },
    });
  } catch (error) {
    console.error("[office audit] write fail", error);
  }
}

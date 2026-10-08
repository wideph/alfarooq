import type { Prisma } from "@prisma/client";
import { hasPermission, type AdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// docs/office-module/02_ARCHITECTURE.md §4 + 06 §N9 — booking office users only
// see their own office's cases unless admin granted `office:cases:read-all`;
// company-side roles (admin/cashier/filing/printing/atta/courier) see all.
export function caseScope(session: AdminSession): Prisma.CaseWhereInput {
  if (session.role === "booking_office" && !hasPermission(session, "office:cases:read-all")) {
    return { bookingOfficeId: session.bookingOfficeId || "__none__" };
  }
  return {};
}

export function canSeeOffice(session: AdminSession, bookingOfficeId: string) {
  if (session.role !== "booking_office") return true;
  if (hasPermission(session, "office:cases:read-all")) return true;
  return session.bookingOfficeId === bookingOfficeId;
}

export async function findAccessibleCase<T extends Prisma.CaseInclude>(
  session: AdminSession,
  caseId: string,
  include?: T
) {
  return prisma.case.findFirst({
    where: { id: caseId, ...caseScope(session) },
    include,
  }) as Promise<Prisma.CaseGetPayload<{ include: T }> | null>;
}

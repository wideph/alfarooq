import type { Prisma } from "@prisma/client";
import type { AdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// docs/office-module/02_ARCHITECTURE.md §4 — booking office users only see their
// own office's cases; everyone else with office:cases:read sees all.
export function caseScope(session: AdminSession): Prisma.CaseWhereInput {
  if (session.role === "booking_office") {
    return { bookingOfficeId: session.bookingOfficeId || "__none__" };
  }
  return {};
}

export function canSeeOffice(session: AdminSession, bookingOfficeId: string) {
  if (session.role !== "booking_office") return true;
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

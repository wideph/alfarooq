import type { Prisma } from "@prisma/client";
import { hasPermission, type AdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CASE_DEPARTMENTS,
  DEPARTMENT_PERMISSIONS,
  type CaseDepartment,
} from "@/lib/office/workflow";
import { isDeptWorkerAccess } from "@/lib/office/permissions";

// §W36 — printing / attestation / courier worker (paison wali koi permission
// nahi): case ki raqam API se kabhi nahi (permissions.ts isDeptWorkerAccess).
export function isDeptWorker(session: AdminSession): boolean {
  return isDeptWorkerAccess(session.role, session.permissions);
}

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

// §W18: departments (FILING/PRINTING/ATTESTATION/COURIER) jin ki write
// permission session ke paas hai. admin/cashier ke liye [] — un ka case scope
// pehle se poora hai, wo limited/dept path kabhi hit nahi karte.
export function deptPermissionsOf(session: AdminSession): CaseDepartment[] {
  if (session.role === "admin" || session.role === "cashier") return [];
  return CASE_DEPARTMENTS.filter((dept) =>
    hasPermission(session, DEPARTMENT_PERMISSIONS[dept])
  );
}

// §W18: cross-office department access — kisi bhi office ka case tab milta
// hai jab session ke paas KISI department ki write permission ho (department
// queues / limited detail / dept files ke liye). Warna null.
export async function findDeptAccessibleCase<T extends Prisma.CaseInclude>(
  session: AdminSession,
  caseId: string,
  include?: T
) {
  if (deptPermissionsOf(session).length === 0) return null;
  return prisma.case.findFirst({
    where: { id: caseId },
    include,
  }) as Promise<Prisma.CaseGetPayload<{ include: T }> | null>;
}

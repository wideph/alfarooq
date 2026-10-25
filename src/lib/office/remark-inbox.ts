import type { Prisma } from "@prisma/client";
import { hasPermission, type AdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { caseScope } from "@/lib/office/case-access";
import { roleToRemarkTarget, type RemarkTarget } from "@/lib/office/workflow";

// §W32 — user ka "Remarks" tab: kisi bhi case mein jo remarks is user ke
// liye bheje gaye (target = us ka role ya us ki department permission), jab
// tak user khud "Done" na kare. Dekh lene (seen) se nahi hat-te.

// User ke remark targets: role ka target + har department write permission ka
// target (maslan "attestation" role + printing + courier permission →
// ATTESTATION, PRINTING, COURIER). Super admin = sirf ADMIN.
export function remarkTargetsForSession(session: AdminSession): RemarkTarget[] {
  const targets = new Set<RemarkTarget>();
  const roleTarget = roleToRemarkTarget(session.role);
  if (roleTarget) targets.add(roleTarget);
  if (session.role !== "admin") {
    if (hasPermission(session, "office:filing:write")) targets.add("FILING");
    if (hasPermission(session, "office:printing:write")) targets.add("PRINTING");
    if (hasPermission(session, "office:attestation-dept:write")) targets.add("ATTESTATION");
    if (hasPermission(session, "office:courier:write")) targets.add("COURIER");
  }
  return [...targets];
}

// Inbox filter: mere targets ke remarks (BOOKING sirf apni office ke cases —
// caseScope; department targets cross-office jaise un ki queues), apne likhe
// hue nahi, aur jo maine Done nahi kiye.
export function remarkInboxWhere(session: AdminSession): Prisma.CaseRemarkWhereInput | null {
  const targets = remarkTargetsForSession(session);
  if (targets.length === 0) return null;
  return {
    createdById: { not: session.adminId },
    dones: { none: { adminId: session.adminId } },
    OR: targets.map((target) =>
      target === "BOOKING"
        ? { recipients: { some: { target } }, case: caseScope(session) }
        : { recipients: { some: { target } } }
    ),
  };
}

export async function remarkInboxCount(session: AdminSession): Promise<number> {
  const where = remarkInboxWhere(session);
  return where ? prisma.caseRemark.count({ where }) : 0;
}

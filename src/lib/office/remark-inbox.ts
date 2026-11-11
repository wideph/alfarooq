import type { Prisma } from "@prisma/client";
import { hasPermission, parsePermissions, type AdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeOffice, caseScope } from "@/lib/office/case-access";
import { notifyUsers, type NotificationInput } from "@/lib/office/notifications";
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

/**
 * §W62 — remark ki notification SIRF unhi users ko jin ke "Remarks" inbox mein
 * ye remark aata hai (remarkTargetsForSession + remarkInboxWhere ka wahi qaida):
 *   • ADMIN → super admins;
 *   • BOOKING → sirf ISI case ke office ke booking users (pehle har office ke
 *     booking users ko jati thi — doosre office ke case ka remark bhi);
 *   • FILING / PRINTING / ATTESTATION / COURIER → us department ka role YA us
 *     department ki write permission wale (cross-office, jaise un ki queues).
 * Likhne wala khud nahi. Kabhi throw nahi karta.
 */
export async function notifyRemarkRecipients(
  caseId: string,
  targets: RemarkTarget[],
  notice: Omit<NotificationInput, "exclude">,
  authorId: string
): Promise<void> {
  try {
    const item = await prisma.case.findUnique({ where: { id: caseId }, select: { bookingOfficeId: true } });
    if (!item || targets.length === 0) return;
    const wanted = new Set(targets);
    const users = await prisma.admin.findMany({
      where: { isActive: true, id: { not: authorId } },
      select: { id: true, email: true, name: true, role: true, permissions: true, bookingOfficeId: true },
    });
    const recipients = users
      .filter((user) => {
        const session: AdminSession = {
          adminId: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: parsePermissions(user.permissions),
          bookingOfficeId: user.bookingOfficeId,
        };
        return remarkTargetsForSession(session).some(
          (target) => wanted.has(target) && (target !== "BOOKING" || canSeeOffice(session, item.bookingOfficeId))
        );
      })
      .map((user) => user.id);
    await notifyUsers(recipients, { ...notice, exclude: authorId });
  } catch (error) {
    console.error("[notify] remark recipients fail", error);
  }
}

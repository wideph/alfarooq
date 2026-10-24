import { prisma } from "@/lib/prisma";

// Wave 11 (§W11.8) — instant notifications. Har helper fire-and-forget hai:
// kabhi throw nahi karta (caller ka request kabhi fail nahi hona chahiye),
// sirf console.error. UI bell 20s polling se live rehta hai.

export type NotificationInput = {
  type: string; // case.create | payment.submit | payment.verify | case.status | file.upload | remark | attestation | request | request.decided
  title: string;
  body?: string | null;
  link?: string | null;
};

async function createMany(userIds: string[], n: NotificationInput) {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  await prisma.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      type: n.type,
      title: n.title.slice(0, 200),
      body: n.body ? n.body.slice(0, 500) : null,
      link: n.link ? n.link.slice(0, 300) : null,
    })),
  });
}

/** Specific users ko notification (ids auto-dedup + null filter). */
export async function notifyUsers(
  userIds: Array<string | null | undefined>,
  n: NotificationInput
): Promise<void> {
  try {
    await createMany(userIds as string[], n);
  } catch (error) {
    console.error("[notify] notifyUsers fail", error);
  }
}

/** Ek role ke tamam ACTIVE users ko (filing | printing | attestation_dept | courier | booking_office | cashier | admin). */
export async function notifyRole(role: string, n: NotificationInput): Promise<void> {
  try {
    const users = await prisma.admin.findMany({
      where: { role, isActive: true },
      select: { id: true },
    });
    await createMany(users.map((u) => u.id), n);
  } catch (error) {
    console.error("[notify] notifyRole fail", error);
  }
}

/** Tamam super admins. */
export async function notifyAdmins(n: NotificationInput): Promise<void> {
  return notifyRole("admin", n);
}

/** Jo users kisi specific permission rakhte hon (ya super admin hon). */
export async function notifyPermission(permission: string, n: NotificationInput): Promise<void> {
  try {
    const users = await prisma.admin.findMany({
      where: {
        isActive: true,
        OR: [{ role: "admin" }, { permissions: { contains: `"${permission}"` } }],
      },
      select: { id: true },
    });
    await createMany(users.map((u) => u.id), n);
  } catch (error) {
    console.error("[notify] notifyPermission fail", error);
  }
}

/**
 * §W30 — courier stage ki notification (advanceCourierStage ke baad):
 *   WAITING_FOR_COURIER_ADDRESS → case creator + admins: address add karein.
 *   WAITING_FOR_COURIER         → courier PERMISSION wale users (+ admins) —
 *     role nahi, kyun ke combined users (maslan "attestation" role + courier
 *     permission) bhi courier ka kaam karte hain.
 * Kabhi throw nahi karta.
 */
export async function notifyCourierStage(caseId: string, stage: string | null | undefined): Promise<void> {
  if (stage !== "WAITING_FOR_COURIER" && stage !== "WAITING_FOR_COURIER_ADDRESS") return;
  try {
    const item = await prisma.case.findUnique({
      where: { id: caseId },
      select: { caseNumber: true, createdByAdminId: true },
    });
    if (!item) return;
    const link = `/office/cases/${caseId}`;
    if (stage === "WAITING_FOR_COURIER") {
      await notifyPermission("office:courier:write", {
        type: "case.status",
        title: `Case ${item.caseNumber}: payment complete — courier slip upload karein`,
        link,
      });
    } else {
      const n = {
        type: "case.status",
        title: `Case ${item.caseNumber}: payment complete — courier address add karein`,
        link,
      };
      await notifyUsers([item.createdByAdminId], n);
      await notifyAdmins(n);
    }
  } catch (error) {
    console.error("[notify] notifyCourierStage fail", error);
  }
}

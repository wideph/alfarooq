/**
 * §W62 — notifications ki READ-ONLY jaanch (kuch likhta nahi, emails / naam
 * print nahi karta — sirf role / office). Batata hai ke har notification
 * (title + waqt) kitne aur kis role / office ke users ko gayi, aur kahan koi
 * notification us case ke office ke bahar booking office users ko gayi.
 *
 * Run:  npx tsx scripts/office-notifications-audit.ts [din=14]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const days = Number(process.argv[2]) || 14;
  const since = new Date(Date.now() - days * 86_400_000);

  const users = await prisma.admin.findMany({
    select: { id: true, role: true, isActive: true, bookingOfficeId: true, permissions: true },
  });
  const byRole = new Map<string, number>();
  for (const user of users) if (user.isActive) byRole.set(user.role, (byRole.get(user.role) ?? 0) + 1);
  console.log(`Active users by role: ${[...byRole].map(([role, n]) => `${role} ${n}`).join(", ")}`);
  const userById = new Map(users.map((user) => [user.id, user]));

  const rows = await prisma.notification.findMany({
    where: { createdAt: { gte: since } },
    select: { userId: true, type: true, title: true, link: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(`Notifications pichle ${days} din: ${rows.length}`);

  // Ek hi bhejne (type + title + second) ka group.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.type}|${row.title}|${row.createdAt.toISOString().slice(0, 19)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const caseIds = [...new Set(rows.map((row) => /\/office\/cases\/([^/?#]+)/.exec(row.link || "")?.[1]).filter(Boolean))] as string[];
  const cases = await prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, bookingOfficeId: true, createdByAdminId: true } });
  const caseById = new Map(cases.map((item) => [item.id, item]));

  const byType = new Map<string, { sends: number; recipients: number; roles: Map<string, number>; foreignBooking: number }>();
  let foreignTotal = 0;
  const foreignExamples: string[] = [];
  for (const [key, list] of groups) {
    const type = key.split("|")[0];
    const stat = byType.get(type) ?? { sends: 0, recipients: 0, roles: new Map(), foreignBooking: 0 };
    stat.sends += 1;
    stat.recipients += list.length;
    const caseId = /\/office\/cases\/([^/?#]+)/.exec(list[0].link || "")?.[1];
    const item = caseId ? caseById.get(caseId) : null;
    for (const row of list) {
      const user = userById.get(row.userId);
      const role = user?.role ?? "?";
      stat.roles.set(role, (stat.roles.get(role) ?? 0) + 1);
      // Booking office user ko DOOSRE office ke case ki notification?
      if (item && user?.role === "booking_office" && user.bookingOfficeId !== item.bookingOfficeId && row.userId !== item.createdByAdminId) {
        stat.foreignBooking += 1;
        foreignTotal += 1;
        if (foreignExamples.length < 8) foreignExamples.push(`${row.createdAt.toISOString().slice(0, 16)} [${type}] ${row.title}`);
      }
    }
    byType.set(type, stat);
  }
  console.log("\nType | bheji gayi | kul recipients | roles | doosre office ke booking users");
  for (const [type, stat] of [...byType].sort((a, b) => b[1].recipients - a[1].recipients)) {
    console.log(
      `${type} | ${stat.sends} | ${stat.recipients} | ${[...stat.roles].map(([role, n]) => `${role}:${n}`).join(" ")} | ${stat.foreignBooking}`
    );
  }
  console.log(`\nDoosre office ke case ki notification booking office users ko: ${foreignTotal}`);
  for (const example of foreignExamples) console.log(`  - ${example}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

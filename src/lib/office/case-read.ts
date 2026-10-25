import type { AdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// §W35 — Cases tab ka read / unread (super admin). Case "read" = CaseRead row
// jis ka status case ke MAUJOODA status ke barabar ho. Case doosri queue
// (status) mein chala jaye → snapshot match nahi karta → phir unread. Naye
// cases ki koi row nahi → unread. Queue counts (cases page) unread nahi, us
// queue ke TAMAM cases ginte hain.

export function tracksCaseReads(session: AdminSession): boolean {
  return session.role === "admin";
}

export async function unreadCaseCount(adminId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n
    FROM "Case" c
    WHERE NOT EXISTS (
      SELECT 1 FROM "CaseRead" r
      WHERE r."caseId" = c."id" AND r."adminId" = ${adminId} AND r."status" = c."status"
    )`;
  return Number(rows[0]?.n ?? 0);
}

// List ke rows mein se kaun se unread hain (ek query).
export async function unreadCaseIds(
  adminId: string,
  cases: Array<{ id: string; status: string }>
): Promise<Set<string>> {
  if (cases.length === 0) return new Set();
  const reads = await prisma.caseRead.findMany({
    where: { adminId, caseId: { in: cases.map((item) => item.id) } },
    select: { caseId: true, status: true },
  });
  const readStatus = new Map(reads.map((row) => [row.caseId, row.status]));
  return new Set(cases.filter((item) => readStatus.get(item.id) !== item.status).map((item) => item.id));
}

// Read: user ne jo status DEKHA wahi snapshot (beech mein queue badal gayi ho
// to case unread hi rehta hai). Na-maujood case ids JOIN se khud gir jate hain.
export async function markCasesRead(adminId: string, items: Array<{ id: string; status: string }>): Promise<number> {
  if (items.length === 0) return 0;
  return prisma.$executeRaw`
    INSERT INTO "CaseRead" ("id", "caseId", "adminId", "status", "readAt")
    SELECT gen_random_uuid()::text, c."id", ${adminId}, t.status, CURRENT_TIMESTAMP
    FROM unnest(${items.map((item) => item.id)}::text[], ${items.map((item) => item.status)}::text[]) AS t(case_id, status)
    JOIN "Case" c ON c."id" = t.case_id
    ON CONFLICT ("caseId", "adminId") DO UPDATE SET "status" = EXCLUDED."status", "readAt" = EXCLUDED."readAt"`;
}

// "Sab read": har unread case maujooda status par read.
export async function markAllCasesRead(adminId: string): Promise<number> {
  return prisma.$executeRaw`
    INSERT INTO "CaseRead" ("id", "caseId", "adminId", "status", "readAt")
    SELECT gen_random_uuid()::text, c."id", ${adminId}, c."status", CURRENT_TIMESTAMP
    FROM "Case" c
    WHERE NOT EXISTS (
      SELECT 1 FROM "CaseRead" r
      WHERE r."caseId" = c."id" AND r."adminId" = ${adminId} AND r."status" = c."status"
    )
    ON CONFLICT ("caseId", "adminId") DO UPDATE SET "status" = EXCLUDED."status", "readAt" = EXCLUDED."readAt"`;
}

import type { Prisma } from "@prisma/client";

// AF-<year>-<000001>, sequential per year (docs BR8). The single UPSERT is
// atomic in Postgres, so concurrent creates never get the same number.
export async function nextCaseNumber(tx: Prisma.TransactionClient, year: number) {
  const rows = await tx.$queryRaw<Array<{ last: number }>>`
    INSERT INTO "CaseCounter" ("year", "last") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "last" = "CaseCounter"."last" + 1
    RETURNING "last"
  `;
  const last = rows[0]?.last ?? 1;
  return `AF-${year}-${String(last).padStart(6, "0")}`;
}

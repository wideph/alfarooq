import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

// docs/office-module/06 §N5 — Board Attestation Number:
//   [last digit of Board-date year][month 2 digits][global sequential count, min 3 digits]
// Count comes from the single BoardAttestationCounter row (id "global") and is shared
// across ALL cases. Count can exceed 999 → used as-is (number just gets longer).
// If the resulting string starts with "0", the leading 0 is replaced with "8".
//
// Must be called inside a transaction so the counter increment is atomic with
// the case update that consumes the number.
export async function nextBoardAttestationNumber(boardDate: Date, db: Db = prisma): Promise<string> {
  const counter = await db.boardAttestationCounter.upsert({
    where: { id: "global" },
    update: { last: { increment: 1 } },
    create: { id: "global", last: 1 },
  });

  const yearDigit = String(boardDate.getUTCFullYear() % 10);
  const month = String(boardDate.getUTCMonth() + 1).padStart(2, "0");
  const count = String(counter.last).padStart(3, "0");
  const raw = `${yearDigit}${month}${count}`;
  return raw.startsWith("0") ? `8${raw.slice(1)}` : raw;
}

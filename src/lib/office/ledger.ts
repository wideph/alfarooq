import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/office/money";

// Balance = Σ CREDIT − Σ DEBIT (BR3.7). Positive = company owes the office.

export async function officeBalances(officeIds?: string[]) {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ["bookingOfficeId", "direction"],
    where: officeIds ? { bookingOfficeId: { in: officeIds } } : {},
    _sum: { amount: true },
  });
  const balances: Record<string, Prisma.Decimal> = {};
  for (const row of rows) {
    const current = balances[row.bookingOfficeId] || new Prisma.Decimal(0);
    const amount = row._sum.amount || new Prisma.Decimal(0);
    balances[row.bookingOfficeId] = row.direction === "CREDIT" ? current.plus(amount) : current.minus(amount);
  }
  return Object.fromEntries(Object.entries(balances).map(([id, value]) => [id, toNumber(value)]));
}

export async function memberBalances(officeId: string) {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ["memberId", "direction"],
    where: { bookingOfficeId: officeId, memberId: { not: null } },
    _sum: { amount: true },
  });
  const balances: Record<string, Prisma.Decimal> = {};
  for (const row of rows) {
    if (!row.memberId) continue;
    const current = balances[row.memberId] || new Prisma.Decimal(0);
    const amount = row._sum.amount || new Prisma.Decimal(0);
    balances[row.memberId] = row.direction === "CREDIT" ? current.plus(amount) : current.minus(amount);
  }
  return Object.fromEntries(Object.entries(balances).map(([id, value]) => [id, toNumber(value)]));
}

// Single member balance (Σ CREDIT − Σ DEBIT), optionally scoped to one office.
// Used by GET /api/office/ledger?memberId= for the per-user ledger (§N9).
export async function memberBalance(memberId: string, officeId?: string) {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ["direction"],
    where: { memberId, ...(officeId ? { bookingOfficeId: officeId } : {}) },
    _sum: { amount: true },
  });
  let total = new Prisma.Decimal(0);
  for (const row of rows) {
    const amount = row._sum.amount || new Prisma.Decimal(0);
    total = row.direction === "CREDIT" ? total.plus(amount) : total.minus(amount);
  }
  return toNumber(total);
}

export async function totalLiabilities() {
  const rows = await prisma.ledgerEntry.groupBy({ by: ["direction"], _sum: { amount: true } });
  let total = new Prisma.Decimal(0);
  for (const row of rows) {
    const amount = row._sum.amount || new Prisma.Decimal(0);
    total = row.direction === "CREDIT" ? total.plus(amount) : total.minus(amount);
  }
  return toNumber(total);
}

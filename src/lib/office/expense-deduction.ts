import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { caseCommissionMemberId } from "@/lib/office/commission";
import { dec, round2 } from "@/lib/office/money";

// §W51 — commission office (FIXED_COMMISSION) ke case expenses ka kitna hissa
// commission member ke account se minus ho.
//   - Office ka rule (BookingOffice.expenseDeductPercent, default 0) case bante
//     waqt Case.expenseDeductPercent mein likh diya jata hai — rule badle to
//     sirf naye cases par asar (purane cases 0 / jo likha tha).
//   - Admin kisi bhi expense par apna % rakh sakta hai
//     (CaseExpense.commissionDeductPercent; null = case ka rule).
// Minus hissa ek EXPENSE DEBIT ledger row (case ka commission member, §W45
// caseCommissionMemberId) — remarks `Commission expense [<expenseId>]: …`.
// Finance isi prefix se member-borne hissa pehchanta hai (admin ke profit se
// dobara minus nahi). Partner / salary office par kuch nahi (partner ka case
// expense pehle hi pool se % ke mutabiq bant-ta hai).

type Db = Prisma.TransactionClient | typeof prisma;

export const COMMISSION_EXPENSE_PREFIX = "Commission expense [";

export function commissionExpenseTag(expenseId: string) {
  return `${COMMISSION_EXPENSE_PREFIX}${expenseId}]`;
}

export function effectiveDeductPercent(
  expense: { commissionDeductPercent: Prisma.Decimal | null },
  casePercent: Prisma.Decimal | number | null | undefined
): Prisma.Decimal {
  return expense.commissionDeductPercent ?? dec(casePercent);
}

// Idempotent: har expense ka target (amount × % ÷ 100) us ki tagged rows ke
// total se milata hai; farq ho to us expense ki rows hata kar ek nayi row
// (wahi pattern jo expense delete par tha). Jahan farq nahi wahan purani row
// bilkul nahi chhedi jati. memberId null = case ki commission kisi member ke
// account mein nahi — minus kis se ho? Is liye kuch nahi badalta (purani rows
// bhi waisi hi).
export async function syncCommissionExpenseDeductions(
  caseId: string,
  actorId: string,
  db: Db = prisma
): Promise<{ applied: boolean; memberId: string | null; changed: number }> {
  const item = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      bookingOfficeId: true,
      createdByAdminId: true,
      commissionMemberId: true,
      expenseDeductPercent: true,
      bookingOffice: { select: { type: true, members: { select: { id: true, adminId: true } } } },
      expenses: {
        select: {
          id: true,
          amount: true,
          description: true,
          expenseDate: true,
          commissionDeductPercent: true,
          deductFromCommission: true,
        },
      },
    },
  });
  if (!item || item.bookingOffice.type !== "FIXED_COMMISSION") return { applied: false, memberId: null, changed: 0 };

  const memberId = caseCommissionMemberId(item, item.bookingOffice.members);
  if (!memberId) return { applied: true, memberId: null, changed: 0 };
  const rows = await db.ledgerEntry.findMany({
    where: { caseId, type: "EXPENSE", remarks: { startsWith: COMMISSION_EXPENSE_PREFIX } },
    select: { id: true, amount: true, direction: true, remarks: true },
  });

  let changed = 0;
  for (const expense of item.expenses) {
    const percent = effectiveDeductPercent(expense, item.expenseDeductPercent);
    const target = round2(dec(expense.amount).mul(percent).div(100));
    const tag = commissionExpenseTag(expense.id);
    const own = rows.filter((row) => row.remarks?.startsWith(tag));
    const current = own.reduce(
      (acc, row) => (row.direction === "DEBIT" ? acc.plus(row.amount) : acc.minus(row.amount)),
      dec(0)
    );

    if (!current.equals(target)) {
      if (own.length > 0) await db.ledgerEntry.deleteMany({ where: { id: { in: own.map((row) => row.id) } } });
      if (target.greaterThan(0)) {
        const label = percent.equals(100) ? "" : ` (${percent.toString()}%)`;
        await db.ledgerEntry.create({
          data: {
            bookingOfficeId: item.bookingOfficeId,
            memberId,
            caseId,
            type: "EXPENSE",
            direction: "DEBIT",
            amount: target,
            entryDate: expense.expenseDate,
            remarks: `${tag}: ${expense.description}${label}`.slice(0, 500),
            createdById: actorId,
          },
        });
      }
      changed += 1;
    }

    // W21 flag isi faisle ke saath (purane readers ke liye).
    const flag = percent.greaterThan(0);
    if (expense.deductFromCommission !== flag) {
      await db.caseExpense.update({ where: { id: expense.id }, data: { deductFromCommission: flag } });
    }
  }
  return { applied: true, memberId, changed };
}

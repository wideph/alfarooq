import { hasPermission, type AdminPermission, type AdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeOffice, caseScope } from "@/lib/office/case-access";
import { deptQueueWhere } from "@/lib/office/workflow";

// §W18: department-queue permission map (dept URL key → write permission).
// Jab viewer ke paas us department ki write permission ho (ya role admin/
// cashier ho — hasPermission admin ke liye true, cashier ka scope waise bhi
// poora), to queue TAMAM offices ke matching cases dikhati hai; caseScope ki
// own-office restriction dept-queue mode mein nahi lagti.
export const DEPT_QUEUE_PERMISSIONS: Record<string, AdminPermission> = {
  filing: "office:filing:write",
  printing: "office:printing:write",
  attestation: "office:attestation-dept:write",
  courier: "office:courier:write",
};

export type CaseQueueCounts = {
  // Har status (queue) ke TAMAM cases — unread nahi.
  statuses: Record<string, number>;
  total: number;
  // Department queues (deptQueueWhere, history nahi) — sirf jo tabs user ko
  // dikhte hain (us dept ki write permission ya cashier).
  depts: Record<string, number>;
};

// §W35 — cases page ki har queue ke upar us queue ke cases ki tadad. Scope
// wahi jo list ka: status queues = caseScope (+ office filter); dept queues =
// list ke dept mode jaisa (permission ho to tamam offices). Sab parallel.
export async function caseQueueCounts(session: AdminSession, officeId: string): Promise<CaseQueueCounts> {
  const officeWhere = officeId && canSeeOffice(session, officeId) ? { bookingOfficeId: officeId } : {};
  const depts = Object.keys(DEPT_QUEUE_PERMISSIONS).filter(
    (dept) => hasPermission(session, DEPT_QUEUE_PERMISSIONS[dept]) || session.role === "cashier"
  );

  const [statusRows, deptTotals] = await Promise.all([
    prisma.case.groupBy({
      by: ["status"],
      where: { ...caseScope(session), ...officeWhere },
      _count: { _all: true },
    }),
    Promise.all(
      depts.map((dept) =>
        prisma.case.count({
          where: {
            ...(hasPermission(session, DEPT_QUEUE_PERMISSIONS[dept]) ? {} : caseScope(session)),
            ...officeWhere,
            AND: [deptQueueWhere(dept, false) ?? {}],
          },
        })
      )
    ),
  ]);

  const statuses: Record<string, number> = {};
  let total = 0;
  for (const row of statusRows) {
    statuses[row.status] = row._count._all;
    total += row._count._all;
  }
  return { statuses, total, depts: Object.fromEntries(depts.map((dept, index) => [dept, deptTotals[index]])) };
}

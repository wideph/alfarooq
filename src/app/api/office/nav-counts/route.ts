import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission, type AdminPermission } from "@/lib/auth";
import { guardOffice, serverError } from "@/lib/office/guard";
import { caseScope } from "@/lib/office/case-access";
import { remarkInboxCount } from "@/lib/office/remark-inbox";
import { unreadCaseCount } from "@/lib/office/case-read";

export const preferredRegion = ["sin1"];

// §W19: department nav tabs (Filing/Printing/Attestation/Courier) ke PENDING
// counts — deptQueueWhere (workflow.ts) ke pending-work statuses ke mutabiq
// (printing queue PRINTED ko dikhati bhi hai magar pending kaam sirf
// WAITING_FOR_PRINTING hai; attestation pending = PRINTED + ATTESTATION).
const DEPT_COUNT_PERMISSIONS = {
  filing: "office:filing:write",
  printing: "office:printing:write",
  attestation: "office:attestation-dept:write",
  courier: "office:courier:write",
} as const satisfies Record<string, AdminPermission>;

type DeptCountKey = keyof typeof DEPT_COUNT_PERMISSIONS;

const DEPT_COUNT_STATUSES = [
  "WAITING_FOR_FILE",
  "WAITING_FOR_PRINTING",
  "PRINTED",
  "ATTESTATION",
  "WAITING_FOR_COURIER",
] as const;

const DEPT_COUNT_STATUS_TO_DEPT: Record<string, DeptCountKey> = {
  WAITING_FOR_FILE: "filing",
  WAITING_FOR_PRINTING: "printing",
  PRINTED: "attestation",
  ATTESTATION: "attestation",
  WAITING_FOR_COURIER: "courier",
};

// GET — navbar badges ke liye ONE aggregated call (har logged-in user 30s
// polling karta hai, is liye sirf count queries, sab parallel). §W11.7.
export async function GET() {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  try {
    const role = session.role || "";

    // cases: role ke hisaab se queue size.
    let casesQuery: Promise<number>;
    switch (role) {
      case "filing":
        casesQuery = prisma.case.count({ where: { status: "WAITING_FOR_FILE" } });
        break;
      case "printing":
        casesQuery = prisma.case.count({ where: { status: "WAITING_FOR_PRINTING" } });
        break;
      case "attestation_dept":
        casesQuery = prisma.case.count({ where: { status: { in: ["PRINTED", "ATTESTATION"] } } });
        break;
      case "courier":
        casesQuery = prisma.case.count({ where: { status: "WAITING_FOR_COURIER" } });
        break;
      case "booking_office":
        // Own-office cases jin par BOOKING target ke unseen remarks hon
        // (distinct caseIds — case.count khud distinct cases ginta hai).
        casesQuery = prisma.case.count({
          where: {
            bookingOfficeId: session.bookingOfficeId || "__none__",
            remarks: { some: { recipients: { some: { target: "BOOKING", seenAt: null } } } },
          },
        });
        break;
      case "admin":
        // §W35: super admin — unread cases (naye + jo doosri queue mein gaye).
        // Pehle unseen ADMIN remarks + set-missing ginte the; remarks ab apne
        // Remarks tab (§W32) par, set-missing warning list ki row par.
        casesQuery = unreadCaseCount(session.adminId);
        break;
      default:
        casesQuery = Promise.resolve(0);
    }

    // payments: scope ke andar PENDING payments (admin/cashier = sab;
    // booking = apni office).
    const paymentsQuery = prisma.payment.count({
      where: { status: "PENDING", case: caseScope(session) },
    });

    // requests: sirf admin/cashier — pending discount + bonus requests.
    const canSeeRequests = role === "admin" || hasPermission(session, "office:payments:verify");
    const requestsQuery = canSeeRequests
      ? (async () => {
          const [discounts, bonuses] = await Promise.all([
            prisma.discountRequest.count({ where: { status: "PENDING" } }),
            prisma.bonusRequest.count({ where: { status: "PENDING" } }),
          ]);
          return discounts + bonuses;
        })()
      : Promise.resolve(0);

    const unreadQuery = prisma.notification.count({
      where: { userId: session.adminId, readAt: null },
    });

    // §W19: dept tabs ke pending counts. Scoping wave-18 queue visibility ke
    // mutabiq — admin/cashier (nav par tabs cashier ko bhi dikhte hain) ya jis
    // dept ki write permission ho, us dept ka count TAMAM offices par (un ka
    // dept queue bhi cross-office hota hai; caseScope nahi lagta). Baghair
    // permission ke dept ka count 0 rehta hai (shape stable). Sab kuch ONE
    // groupBy query se; kisi dept ki permission nahi to query hi skip.
    const seesAllOffices = role === "admin" || role === "cashier";
    const permittedDepts = (Object.keys(DEPT_COUNT_PERMISSIONS) as DeptCountKey[]).filter(
      (dept) => seesAllOffices || hasPermission(session, DEPT_COUNT_PERMISSIONS[dept])
    );
    const deptCountsQuery =
      permittedDepts.length > 0
        ? prisma.case.groupBy({
            by: ["status"],
            where: { status: { in: [...DEPT_COUNT_STATUSES] } },
            _count: { _all: true },
          })
        : Promise.resolve([]);

    const [cases, payments, requests, unreadNotifications, deptStatusRows, remarks] = await Promise.all([
      casesQuery,
      paymentsQuery,
      requestsQuery,
      unreadQuery,
      deptCountsQuery,
      // §W32: Remarks tab badge — is user ke liye bheje gaye, abhi Done nahi.
      remarkInboxCount(session),
    ]);

    const deptCounts: Record<DeptCountKey, number> = { filing: 0, printing: 0, attestation: 0, courier: 0 };
    for (const row of deptStatusRows) {
      const dept = DEPT_COUNT_STATUS_TO_DEPT[row.status];
      if (dept && permittedDepts.includes(dept)) deptCounts[dept] += row._count._all;
    }

    return NextResponse.json({ cases, payments, requests, unreadNotifications, deptCounts, remarks });
  } catch (error) {
    return serverError(error);
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { guardOffice, serverError } from "@/lib/office/guard";
import { caseScope } from "@/lib/office/case-access";

export const preferredRegion = ["sin1"];

// Statuses jahan set select hona zaroori hai — in mein setId null ho to
// admin ke liye "set missing" warning (§W11.7).
const SET_MISSING_STATUSES = [
  "PRINTED",
  "ATTESTATION",
  "ATTESTATION_COMPLETE",
  "WAITING_FOR_COURIER",
  "DELIVERED",
] as const;

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
      case "atta":
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
      case "admin": {
        // Unseen ADMIN remarks wale cases + set-missing warnings.
        casesQuery = (async () => {
          const [unseenRemarks, setMissing] = await Promise.all([
            prisma.case.count({
              where: { remarks: { some: { recipients: { some: { target: "ADMIN", seenAt: null } } } } },
            }),
            prisma.case.count({
              where: { setId: null, status: { in: [...SET_MISSING_STATUSES] } },
            }),
          ]);
          return unseenRemarks + setMissing;
        })();
        break;
      }
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

    const [cases, payments, requests, unreadNotifications] = await Promise.all([
      casesQuery,
      paymentsQuery,
      requestsQuery,
      unreadQuery,
    ]);

    return NextResponse.json({ cases, payments, requests, unreadNotifications });
  } catch (error) {
    return serverError(error);
  }
}

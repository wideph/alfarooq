import { NextRequest, NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, DEPT_WORKER_MONEY_DENIED, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { caseScope, findAccessibleCase, isDeptWorker } from "@/lib/office/case-access";
import { recomputeCaseFinancials } from "@/lib/office/commission";
import { dec, parseAmount, sum, toNumber } from "@/lib/office/money";
import { PAYMENT_METHODS, PAYMENT_STATUSES, type PaymentMethod } from "@/lib/office/permissions";
import { notifyCourierStage, notifyPermission } from "@/lib/office/notifications";
import { autoDistributeOnPaymentReceived } from "@/lib/office/profit-share";
import { uploadOfficeFile } from "@/lib/office/r2";
import { activateWorkflowOnFirstPayment, advanceCourierStage } from "@/lib/office/workflow";
import { generateSetDates } from "@/lib/office/date-engine";
import { cleanText, parseDateOnly, toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

export const maxDuration = 300;

// GET ?status=PENDING&caseId=&page= — cashier queue / lists, scoped by role.
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  // §W36: printing / attestation / courier worker ko raqam ki maloomat nahi.
  if (isDeptWorker(session)) return forbidden(DEPT_WORKER_MONEY_DENIED);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const caseId = searchParams.get("caseId") || "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = 50;

  const where: Prisma.PaymentWhereInput = { case: caseScope(session) };
  if (status && (PAYMENT_STATUSES as readonly string[]).includes(status)) where.status = status;
  if (caseId) where.caseId = caseId;

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        case: {
          select: {
            id: true,
            caseNumber: true,
            clientName: true,
            // §W29: payment request list mein student ki pehchan (Roll / Reg).
            rollNumber: true,
            registrationNumber: true,
            agreedAmount: true,
            bookingOffice: { select: { id: true, name: true, type: true } },
          },
        },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  // §W12.3 — Finance page ko "kon si payment kis case se" aur "kis ne submit
  // ki" chahiye: case + bookingOffice already included above; submittedByName
  // ke liye ek hi admin names query (payments par koi submittedBy relation
  // nahi hai, sirf id).
  // §W29: isi parallel batch mein page ke cases ki RECEIVED payments — har
  // payment ka "is payment se pehle baqi" (BR1.4: remaining = max(agreed −
  // received, 0), sirf RECEIVED ginti hoti hain).
  const adminIds = [...new Set(items.map((item) => item.submittedById))];
  const caseIds = [...new Set(items.map((item) => item.caseId))];
  const [admins, receivedRows] = await Promise.all([
    adminIds.length
      ? prisma.admin.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    caseIds.length
      ? prisma.payment.findMany({
          where: { caseId: { in: caseIds }, status: "RECEIVED" },
          select: { id: true, caseId: true, amount: true, paymentDate: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const adminNames = new Map(admins.map((admin) => [admin.id, admin.name]));
  const receivedByCase = new Map<string, typeof receivedRows>();
  for (const row of receivedRows) {
    const list = receivedByCase.get(row.caseId) ?? [];
    list.push(row);
    receivedByCase.set(row.caseId, list);
  }

  // "Pehle" = (paymentDate, createdAt, id) order. Jo payment abhi RECEIVED nahi
  // (PENDING / NOT_RECEIVED / BOGUS) us ke liye case ki TAMAM RECEIVED payments
  // pehle ki hain — yani abhi ka baqi. RECEIVED payment ke liye sirf us se
  // pehle wali RECEIVED payments.
  const isBefore = (
    a: { paymentDate: Date; createdAt: Date; id: string },
    b: { paymentDate: Date; createdAt: Date; id: string }
  ) =>
    a.paymentDate.getTime() !== b.paymentDate.getTime()
      ? a.paymentDate < b.paymentDate
      : a.createdAt.getTime() !== b.createdAt.getTime()
        ? a.createdAt < b.createdAt
        : a.id < b.id;

  function balanceFor(item: (typeof items)[number]) {
    const agreed = dec(item.case.agreedAmount);
    const rows = receivedByCase.get(item.caseId) ?? [];
    const receivedBefore = sum(
      rows
        .filter((row) => row.id !== item.id && (item.status !== "RECEIVED" || isBefore(row, item)))
        .map((row) => row.amount)
    );
    const remainingBefore = Prisma.Decimal.max(agreed.minus(receivedBefore), 0);
    const remainingAfter = Prisma.Decimal.max(remainingBefore.minus(item.amount), 0);
    const extraAfter = Prisma.Decimal.max(dec(item.amount).minus(remainingBefore), 0);
    return {
      receivedBefore: toNumber(receivedBefore),
      remainingBefore: toNumber(remainingBefore),
      remainingAfter: toNumber(remainingAfter),
      extraAfter: toNumber(extraAfter),
    };
  }

  return NextResponse.json({
    items: items.map((item) =>
      toJson({
        ...item,
        submittedByName: adminNames.get(item.submittedById) ?? null,
        hasSlip: Boolean(item.slipKey),
        slipKey: undefined,
        balance: balanceFor(item),
      })
    ),
    total,
    page,
    pageSize,
  });
}

// POST multipart: caseId, amount, paymentDate, method, reference, remarks, slip.
// Booking office → PENDING. Cashier / super admin may pass status=RECEIVED to
// record a payment they received themselves (BR1.1/1.2).
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const canSubmit = hasPermission(session, "office:payments:submit");
  const canVerify = hasPermission(session, "office:payments:verify");
  if (!canSubmit && !canVerify) return forbidden();

  try {
    const formData = await request.formData();
    const caseId = String(formData.get("caseId") || "");
    const item = await findAccessibleCase(session, caseId);
    if (!item) return notFound("Case nahi mila");
    if (item.status === "CANCELLED") return badRequest("Cancelled case par payment nahi lag sakti");

    const amount = parseAmount(formData.get("amount"), { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai");
    const paymentDate = parseDateOnly(formData.get("paymentDate"));
    if (!paymentDate) return badRequest("Payment date zaroori hai");
    const method = String(formData.get("method") || "CASH") as PaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) return badRequest("Payment method sahi nahi hai");

    const requestedStatus = String(formData.get("status") || "PENDING");
    const status = canVerify && requestedStatus === "RECEIVED" ? "RECEIVED" : "PENDING";

    let slipKey: string | null = null;
    let slipType: string | null = null;
    const slip = formData.get("slip");
    if (slip instanceof File && slip.size > 0) {
      const uploaded = await uploadOfficeFile(slip, `slips/${item.caseNumber}`);
      slipKey = uploaded.key;
      slipType = uploaded.type;
    }

    const payment = await prisma.payment.create({
      data: {
        caseId,
        amount,
        paymentDate,
        method,
        reference: cleanText(formData.get("reference"), 120),
        remarks: cleanText(formData.get("remarks"), 500),
        slipKey,
        slipType,
        status,
        submittedById: session.adminId,
        verifiedById: status === "RECEIVED" ? session.adminId : null,
        verifiedAt: status === "RECEIVED" ? new Date() : null,
      },
    });

    const result = await recomputeCaseFinancials(caseId, session, { paymentId: payment.id });

    // §W11.1/§W30: direct RECEIVED payment se poora hisaab clear ho gaya aur
    // case ATTESTATION_COMPLETE par hai → courier stage (address ke hisaab
    // se). Business write request path mein; notification after() mein.
    const courierStage =
      status === "RECEIVED" && result.remaining === 0 && result.agreedAmount > 0
        ? await advanceCourierStage(caseId)
        : null;

    // §N7: a payment recorded directly as RECEIVED (cashier/admin) activates
    // the department workflow when it is the case's first RECEIVED payment.
    let datesNeeded = false;
    if (status === "RECEIVED") {
      // §W11.4: PROFIT_SHARE office — har RECEIVED payment par pool
      // auto-distribute (idempotent). Business write: request path mein.
      // §W20: auto-distribute (ledger) aur workflow activation (case status)
      // independent hain aur dono kabhi throw nahi karte — parallel.
      [, { datesNeeded }] = await Promise.all([
        autoDistributeOnPaymentReceived(caseId, session),
        activateWorkflowOnFirstPayment(caseId),
      ]);
    }

    // W13.2: audit log + notifications + AI date generation (DeepSeek, can
    // take minutes) sab response ke baad — mutation response foran return.
    after(async () => {
      await logOfficeAction(session, {
        action: "payment.create",
        entity: "Payment",
        entityId: payment.id,
        after: { caseId, amount, paymentDate, method, status, hasSlip: Boolean(slipKey) },
      });
      // §W11.8: payment submit → verify permission walon ko notification.
      if (status === "PENDING") {
        await notifyPermission("office:payments:verify", {
          type: "payment.submit",
          title: `Payment submit — case ${item.caseNumber}`,
          body: `Rs ${amount} ki payment verify karein`,
          link: `/office/cases/${caseId}`,
        });
      }
      await notifyCourierStage(caseId, courierStage);
      if (datesNeeded) {
        try {
          await generateSetDates(caseId);
        } catch (error) {
          console.error("[office] generateSetDates fail", error);
        }
      }
    });

    return NextResponse.json(
      toJson({ payment: { ...payment, hasSlip: Boolean(slipKey), slipKey: undefined }, ...result }),
      { status: 201 }
    );
  } catch (error) {
    return serverError(error);
  }
}

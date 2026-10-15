import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission, type AdminPermission } from "@/lib/auth";
import { badRequest, guardOffice, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { caseScope, canSeeOffice } from "@/lib/office/case-access";
import { nextCaseNumber } from "@/lib/office/case-numbers";
import { parseAmount } from "@/lib/office/money";
import { cleanText, toJson } from "@/lib/office/serializers";
import { CASE_STATUSES, LEGACY_CASE_STATUSES } from "@/lib/office/permissions";
import { notifyAdmins } from "@/lib/office/notifications";
import { caseListInclude, serializeCaseRow } from "@/lib/office/case-detail";
import { uploadOfficeFile } from "@/lib/office/r2";
import {
  findCachedOffice,
  getOfficeAttestationTypes,
  getOfficeCategories,
  getOfficeCategorySets,
} from "@/lib/office/setup-cache";
import {
  deptQueueWhere,
  isFilingLimited,
  parseCaseInput,
  serializeFilingCase,
  unseenWarningCaseIds,
} from "@/lib/office/workflow";

export const preferredRegion = ["sin1"];

const PAGE_SIZE = 50;

// §W18: department-queue permission map (dept URL key → write permission).
// Jab viewer ke paas us department ki write permission ho (ya role admin/
// cashier ho — hasPermission admin ke liye true, cashier ka scope waise bhi
// poora), to queue TAMAM offices ke matching cases dikhati hai; caseScope ki
// own-office restriction dept-queue mode mein nahi lagti.
const DEPT_QUEUE_PERMISSIONS: Record<string, AdminPermission> = {
  filing: "office:filing:write",
  printing: "office:printing:write",
  attestation: "office:attestation-dept:write",
  courier: "office:courier:write",
};

type DeptQueueRow = Prisma.CaseGetPayload<{ include: typeof caseListRowInclude }>;

// §W18 privacy: department-queue mein DOOSRE offices ki rows ka slim shape —
// filing-limited payload (serializeFilingCase) + department ke kaam ke
// fields. Money fields (agreedAmount / totals / payments / expenses /
// commission) aur contacts kabhi nahi. `limited: true` flag UI ke liye.
async function serializeDeptQueueCase(item: DeptQueueRow) {
  const base = (await serializeFilingCase(item)) as Record<string, unknown>;
  return toJson({
    ...base,
    bookingOffice: { id: item.bookingOffice.id, name: item.bookingOffice.name },
    attestations: item.attestations.map((a) => ({
      id: a.id,
      status: a.status,
      scheduledDate: a.scheduledDate,
      completedDate: a.completedDate,
      attestationType: { name: a.attestationType.name },
    })),
    expectedPrintingDate: item.expectedPrintingDate,
    isPrinted: item.isPrinted,
    courierNumber: item.courierNumber,
    createdAt: item.createdAt,
    currentAttestationId: item.currentAttestationId,
    limited: true,
  });
}

// F6: list rows ke liye sirf zaroori fields — attestations ka slim select
// (list page ke badges sirf id/status/completedDate/type-name use karte hain),
// payments ke sirf totals wale scalar fields. §W14.2: expenses ka slim select
// (amount/description) expenseSummary ke liye; ledger kabhi include nahi hota.
// Payload mein raw payments nahi bhejte (totals kaafi hai).
const caseListRowInclude = {
  bookingOffice: { select: { id: true, name: true, type: true } },
  category: { select: { id: true, name: true } },
  set: { select: { id: true, name: true } },
  attestations: {
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      status: true,
      // §W18: scheduledDate dept-queue ke slim rows mein chahiye.
      scheduledDate: true,
      completedDate: true,
      attestationType: { select: { name: true } },
    },
  },
  payments: { select: { id: true, amount: true, status: true, paymentDate: true } },
  // §W14.2: expenseSummary ke liye slim expense rows (amount + description,
  // newest first). DB chhota hai is liye poori rows cheap hain.
  expenses: {
    orderBy: { expenseDate: "desc" as const },
    select: { amount: true, description: true },
  },
} satisfies Prisma.CaseInclude;

export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const officeId = searchParams.get("officeId") || "";
  const q = (searchParams.get("q") || "").trim();
  const deptRaw = (searchParams.get("dept") || "").trim().toLowerCase();
  // Legacy alias: purana "atta" URL key ab "attestation" hai.
  const dept = deptRaw === "atta" ? "attestation" : deptRaw;
  const history = searchParams.get("history") === "1";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  // §W18: dept-queue mode mein jab viewer ke paas us department ki write
  // permission ho to office restriction nahi lagti (tamam offices ka queue).
  // Booking user baghair us department permission ke own-office scoped rehta
  // hai (purana behavior).
  const deptPermission = dept ? DEPT_QUEUE_PERMISSIONS[dept] : undefined;
  const crossOfficeQueue = Boolean(deptPermission && hasPermission(session, deptPermission));
  const where: Prisma.CaseWhereInput = crossOfficeQueue ? {} : { ...caseScope(session) };
  // §W11.1: filter accepts all 13 new keys (+ legacy keys as fallback).
  const ALL_STATUSES: readonly string[] = [...CASE_STATUSES, ...LEGACY_CASE_STATUSES];
  if (status && ALL_STATUSES.includes(status)) where.status = status;
  // "open" = abhi main flow mein hai (DELIVERED + musadiqa post-delivery
  // stages aur CANCELLED ke ilawa).
  if (status === "open") {
    where.status = {
      notIn: [
        "DELIVERED",
        "MUSADIQA_APPLIED",
        "MUSADIQA_FEES_PAID",
        "MUSADIQA_SENT_BY_BOARD",
        "MUSADIQA_VERIFIED",
        "CANCELLED",
      ],
    };
  }
  if (officeId && canSeeOffice(session, officeId)) where.bookingOfficeId = officeId;
  // §N7 department queues: ?dept=filing|printing|attestation|courier.
  if (dept) {
    const deptWhere = deptQueueWhere(dept, history);
    if (deptWhere) where.AND = [...(Array.isArray(where.AND) ? where.AND : []), deptWhere];
  }
  if (q) {
    where.OR = [
      { caseNumber: { contains: q, mode: "insensitive" } },
      { clientName: { contains: q, mode: "insensitive" } },
      { rollNumber: { contains: q, mode: "insensitive" } },
      { registrationNumber: { contains: q, mode: "insensitive" } },
      { contacts: { some: { phone: { contains: q } } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.case.findMany({
      where,
      orderBy: [{ isUrgent: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: caseListRowInclude,
    }),
    prisma.case.count({ where }),
  ]);

  // §N7: filing department gets the stripped payload (no money fields).
  // Cache-Control: no-store — list har waqt fresh honi chahiye (live refresh).
  const NO_STORE = { "Cache-Control": "no-store" };
  if (isFilingLimited(session)) {
    const rows = await Promise.all(items.map((item) => serializeFilingCase(item)));
    return NextResponse.json({ items: rows, total, page, pageSize: PAGE_SIZE }, { headers: NO_STORE });
  }

  const unseen = await unseenWarningCaseIds(
    session,
    items.map((item) => item.id)
  );

  const rows = await Promise.all(
    items.map(async (item) => {
      // §W18 privacy: doosre offices ki rows (jo sirf dept-queue permission
      // ki wajah se visible hain) slim shape mein — koi money field nahi.
      if (!canSeeOffice(session, item.bookingOfficeId)) {
        return serializeDeptQueueCase(item);
      }
      const row = serializeCaseRow(item, { hasUnseenWarning: unseen.has(item.id) }) as Record<string, unknown>;
      // F6: raw payment/expense rows list payload mein nahi — totals aur
      // expenseSummary pehle se computed hain.
      delete row.payments;
      delete row.expenses;
      row.limited = false;
      return row;
    })
  );

  return NextResponse.json(
    {
      items: rows,
      total,
      page,
      pageSize: PAGE_SIZE,
    },
    { headers: NO_STORE }
  );
}

export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;

  try {
    const { fields: body, clientPicture } = await parseCaseInput(request);

    // Booking office users always create for their own office.
    const bookingOfficeId =
      session.role === "booking_office"
        ? session.bookingOfficeId || ""
        : typeof body.bookingOfficeId === "string"
          ? body.bookingOfficeId
          : "";
    if (!bookingOfficeId) return badRequest("Booking office select karein");
    // §W20: office / category / set / attestation-type static data hain —
    // cached loaders (60s + tag invalidation) ek hi parallel batch mein
    // (pehle ye 4 alag sequential DB round-trips thi). Checks ka order aur
    // error messages bilkul wahi hain.
    const [office, categories, categorySets, attestationTypes] = await Promise.all([
      findCachedOffice(bookingOfficeId),
      getOfficeCategories(),
      getOfficeCategorySets(),
      getOfficeAttestationTypes(),
    ]);
    if (!office || !office.isActive) return badRequest("Booking office nahi mila ya inactive hai");

    // §N7: client name is optional; at least one of Roll Number / Registration
    // Number is compulsory.
    const clientName = cleanText(body.clientName, 200) || "";
    const rollNumber = cleanText(body.rollNumber, 80);
    const registrationNumber = cleanText(body.registrationNumber, 80);
    if (!rollNumber && !registrationNumber) return badRequest("Roll Number ya Registration Number lazmi hai");

    // Category ab LAZMI hai (F4) — select karna zaroori, aur active honi chahiye.
    const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
    if (!categoryId) return badRequest("Category select karna lazmi hai");
    const category = categories.find((row) => row.id === categoryId) ?? null;
    if (!category || !category.isActive) return badRequest("Category nahi mili ya inactive hai");

    // §W14.9: optional set — diya ho to usi category ka hona chahiye taake
    // dates engine + workflow creation se hi set par chalein.
    const setId = typeof body.setId === "string" && body.setId.trim() ? body.setId.trim() : "";
    if (setId) {
      const set = categorySets.find((row) => row.id === setId) ?? null;
      if (!set || !set.isActive) return badRequest("Set of Attestations nahi mila ya inactive hai");
      if (set.categoryId !== categoryId) return badRequest("Set of Attestations is category ka nahi hai");
    }

    const agreedAmount =
      body.agreedAmount === undefined || body.agreedAmount === "" ? null : parseAmount(body.agreedAmount);
    if (body.agreedAmount !== undefined && body.agreedAmount !== "" && agreedAmount === null) {
      return badRequest("Agreed amount sahi nahi hai");
    }

    const attestationTypeIds: string[] = Array.isArray(body.attestationTypeIds)
      ? [...new Set((body.attestationTypeIds as unknown[]).filter((id): id is string => typeof id === "string"))]
      : [];
    if (attestationTypeIds.length > 0) {
      const knownTypeIds = new Set(attestationTypes.map((row) => row.id));
      if (!attestationTypeIds.every((typeId) => knownTypeIds.has(typeId))) {
        return badRequest("Koi attestation type nahi mila");
      }
    }

    const contacts = (Array.isArray(body.contacts) ? body.contacts : [])
      .map((c: { phone?: unknown; label?: unknown }) => ({
        phone: cleanText(c?.phone, 40),
        label: cleanText(c?.label, 60),
      }))
      .filter((c: { phone: string | null }) => c.phone) as Array<{ phone: string; label: string | null }>;
    const addresses = (Array.isArray(body.addresses) ? body.addresses : [])
      .map((a: { address?: unknown; label?: unknown }) => ({
        address: cleanText(a?.address, 500),
        label: cleanText(a?.label, 60),
      }))
      .filter((a: { address: string | null }) => a.address) as Array<{ address: string; label: string | null }>;

    // BR3.1: type-1 commission snapshot from the office's grid.
    let commissionAmount = new Prisma.Decimal(0);
    if (office.type === "FIXED_COMMISSION" && categoryId) {
      const grid = await prisma.bookingOfficeCommission.findUnique({
        where: { bookingOfficeId_categoryId: { bookingOfficeId, categoryId } },
      });
      if (grid) commissionAmount = grid.amount;
    }

    const year = new Date(Date.now() + 5 * 3_600_000).getUTCFullYear();

    // Client picture (optional) goes to R2 like payment slips.
    let clientPictureKey: string | null = null;
    let clientPictureType: string | null = null;

    const created = await prisma.$transaction(async (tx) => {
      const caseNumber = await nextCaseNumber(tx, year);
      if (clientPicture) {
        const uploaded = await uploadOfficeFile(clientPicture, `clients/${caseNumber}`);
        clientPictureKey = uploaded.key;
        clientPictureType = uploaded.type;
      }
      return tx.case.create({
        data: {
          caseNumber,
          bookingOfficeId,
          createdByAdminId: session.adminId,
          categoryId,
          // §W14.9: optional set connect (dates engine creation se chale).
          setId: setId || null,
          // §W11.1: naya case hamesha 1st payment pending se start hota hai.
          status: "FIRST_PAYMENT_PENDING",
          clientName,
          rollNumber,
          registrationNumber,
          agreedAmount: agreedAmount ?? new Prisma.Decimal(0),
          agreedAmountRemarks: cleanText(body.agreedAmountRemarks, 500),
          courierNumber: cleanText(body.courierNumber, 120),
          isUrgent: Boolean(body.isUrgent),
          clientPictureKey,
          clientPictureType,
          commissionAmount,
          notes: cleanText(body.notes, 2000),
          contacts: { create: contacts },
          addresses: { create: addresses },
          attestations: {
            create: attestationTypeIds.map((attestationTypeId, index) => ({
              attestationTypeId,
              order: index + 1,
            })),
          },
        },
        include: caseListInclude,
      });
    }, { maxWait: 10000, timeout: 30000 });

    await logOfficeAction(session, {
      action: "case.create",
      entity: "Case",
      entityId: created.id,
      after: { caseNumber: created.caseNumber, clientName, bookingOfficeId, categoryId, agreedAmount },
    });

    // §W11.8: case.create → tamam admins ko notification.
    await notifyAdmins({
      type: "case.create",
      title: `New case ${created.caseNumber}`,
      link: `/office/cases/${created.id}`,
    });

    return NextResponse.json(serializeCaseRow(created), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

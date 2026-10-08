import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { caseScope, canSeeOffice } from "@/lib/office/case-access";
import { nextCaseNumber } from "@/lib/office/case-numbers";
import { parseAmount } from "@/lib/office/money";
import { cleanText } from "@/lib/office/serializers";
import { CASE_STATUSES } from "@/lib/office/permissions";
import { caseListInclude, serializeCaseRow } from "@/lib/office/case-detail";
import { uploadOfficeFile } from "@/lib/office/r2";
import {
  deptQueueWhere,
  isFilingLimited,
  parseCaseInput,
  serializeFilingCase,
  unseenWarningCaseIds,
} from "@/lib/office/workflow";

export const preferredRegion = ["sin1"];

const PAGE_SIZE = 50;

// F6: list rows ke liye sirf zaroori fields — attestations ka slim select
// (list page ke badges sirf id/status/completedDate/type-name use karte hain),
// payments ke sirf totals wale scalar fields. expenses/ledger kabhi include
// nahi hote. Payload mein raw payments nahi bhejte (totals kaafi hai).
const caseListRowInclude = {
  bookingOffice: { select: { id: true, name: true, type: true } },
  category: { select: { id: true, name: true } },
  set: { select: { id: true, name: true } },
  attestations: {
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      status: true,
      completedDate: true,
      attestationType: { select: { name: true } },
    },
  },
  payments: { select: { id: true, amount: true, status: true, paymentDate: true } },
} satisfies Prisma.CaseInclude;

export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const officeId = searchParams.get("officeId") || "";
  const q = (searchParams.get("q") || "").trim();
  const dept = (searchParams.get("dept") || "").trim().toLowerCase();
  const history = searchParams.get("history") === "1";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const where: Prisma.CaseWhereInput = { ...caseScope(session) };
  if (status && (CASE_STATUSES as readonly string[]).includes(status)) where.status = status;
  if (status === "open") where.status = { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] };
  if (officeId && canSeeOffice(session, officeId)) where.bookingOfficeId = officeId;
  // §N7 department queues: ?dept=filing|printing|atta|courier.
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
  if (isFilingLimited(session)) {
    const rows = await Promise.all(items.map((item) => serializeFilingCase(item)));
    return NextResponse.json({ items: rows, total, page, pageSize: PAGE_SIZE });
  }

  const unseen = await unseenWarningCaseIds(
    session,
    items.map((item) => item.id)
  );

  return NextResponse.json({
    items: items.map((item) => {
      const row = serializeCaseRow(item, { hasUnseenWarning: unseen.has(item.id) }) as Record<string, unknown>;
      // F6: raw payment rows list payload mein nahi — totals pehle se computed.
      delete row.payments;
      return row;
    }),
    total,
    page,
    pageSize: PAGE_SIZE,
  });
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
    const office = await prisma.bookingOffice.findUnique({ where: { id: bookingOfficeId } });
    if (!office || !office.isActive) return badRequest("Booking office nahi mila ya inactive hai");

    // §N7: client name is optional; at least one of r-number / reg-number is
    // compulsory.
    const clientName = cleanText(body.clientName, 200) || "";
    const rollNumber = cleanText(body.rollNumber, 80);
    const registrationNumber = cleanText(body.registrationNumber, 80);
    if (!rollNumber && !registrationNumber) return badRequest("r-number ya reg-number lazmi hai");

    // Category ab LAZMI hai (F4) — select karna zaroori, aur active honi chahiye.
    const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
    if (!categoryId) return badRequest("Category select karna lazmi hai");
    const category = await prisma.caseCategory.findUnique({ where: { id: categoryId } });
    if (!category || !category.isActive) return badRequest("Category nahi mili ya inactive hai");

    const agreedAmount =
      body.agreedAmount === undefined || body.agreedAmount === "" ? null : parseAmount(body.agreedAmount);
    if (body.agreedAmount !== undefined && body.agreedAmount !== "" && agreedAmount === null) {
      return badRequest("Agreed amount sahi nahi hai");
    }

    const attestationTypeIds: string[] = Array.isArray(body.attestationTypeIds)
      ? [...new Set((body.attestationTypeIds as unknown[]).filter((id): id is string => typeof id === "string"))]
      : [];
    if (attestationTypeIds.length > 0) {
      const count = await prisma.attestationType.count({ where: { id: { in: attestationTypeIds } } });
      if (count !== attestationTypeIds.length) return badRequest("Koi attestation type nahi mila");
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

    return NextResponse.json(serializeCaseRow(created), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

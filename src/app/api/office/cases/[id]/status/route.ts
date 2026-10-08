import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { notifyRole, notifyUsers } from "@/lib/office/notifications";
import { CASE_STATUSES, type CaseStatus } from "@/lib/office/permissions";
import { STATUS_LABELS } from "@/lib/office/labels";
import { cleanText } from "@/lib/office/serializers";
import { applyAttestationJump, applyStatusSideEffects } from "@/lib/office/workflow";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// §W11.1: musadiqa stages aur CANCELLED sirf super admin set kar sakta hai.
const ADMIN_ONLY_STATUSES: readonly string[] = [
  "MUSADIQA_APPLIED",
  "MUSADIQA_FEES_PAID",
  "MUSADIQA_SENT_BY_BOARD",
  "MUSADIQA_VERIFIED",
  "CANCELLED",
];

// Naya stage kis department ka hai (notification target role).
const STAGE_ROLE: Record<string, string> = {
  WAITING_FOR_FILE: "filing",
  WAITING_FOR_PRINTING: "printing",
  PRINTED: "atta",
  ATTESTATION: "atta",
  WAITING_FOR_COURIER: "courier",
};

// Attestation office / super admin: printed flag + manual case status.
// §W11.1: admin ANY of the 13 statuses (note lazmi); status=ATTESTATION
// requires attestationId (dropdown "Attestation: <name>" option).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:attestation:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    const body = await request.json();
    const data: { status?: string; isPrinted?: boolean; printedAt?: Date | null } = {};
    let adminNote: string | null = null;
    let jumpAttestationId: string | null = null;

    if (body.isPrinted !== undefined) {
      const isPrinted = Boolean(body.isPrinted);
      data.isPrinted = isPrinted;
      data.printedAt = isPrinted ? item.printedAt || new Date() : null;
      if (
        isPrinted &&
        ["FIRST_PAYMENT_PENDING", "WAITING_FOR_FILE", "WAITING_FOR_PRINTING"].includes(item.status)
      ) {
        data.status = "PRINTED";
      }
    }

    if (body.status !== undefined) {
      const status = body.status as CaseStatus;
      if (!CASE_STATUSES.includes(status)) return badRequest("Status sahi nahi hai");
      if (session.role !== "admin" && ADMIN_ONLY_STATUSES.includes(status)) {
        return forbidden("Ye status sirf super admin set kar sakta hai");
      }
      // Wajah (note/remarks) lazmi hai — OfficeAuditLog ke after.note mein
      // store hoti hai.
      adminNote = cleanText(body.note ?? body.remarks, 500);
      if (!adminNote) return badRequest("Status change ki wajah (note/remarks) lazmi hai");

      if (status === "ATTESTATION") {
        // Dynamic status: current attestation step select karna zaroori hai.
        const attestationId = typeof body.attestationId === "string" ? body.attestationId : "";
        if (!attestationId) return badRequest("Attestation select karna lazmi hai");
        const attestation = await prisma.caseAttestation.findFirst({
          where: { id: attestationId, caseId: id },
          select: { id: true },
        });
        if (!attestation) return badRequest("Ye attestation is case ki nahi hai");
        jumpAttestationId = attestationId;
      }

      data.status = status;
      if (status === "PRINTED" && !item.isPrinted) {
        data.isPrinted = true;
        data.printedAt = new Date();
      }
    }

    if (Object.keys(data).length === 0) return badRequest("Kuch change nahi kiya");

    const jumpResult = await prisma.$transaction(
      async (tx) => {
        // ATTESTATION jump: steps realign + currentAttestationId + status.
        if (jumpAttestationId) {
          if (data.isPrinted !== undefined) {
            await tx.case.update({
              where: { id },
              data: { isPrinted: data.isPrinted, printedAt: data.printedAt },
            });
          }
          return applyAttestationJump(tx, id, jumpAttestationId);
        }
        await tx.case.update({ where: { id }, data });
        // Later-stage jump ke side effects (sab attestations DONE / printed).
        if (data.status) {
          await applyStatusSideEffects(tx, id, data.status);
        }
        return null;
      },
      { maxWait: 10000, timeout: 30000 }
    );

    // W13.2: audit log + notifications response ke baad (after) chalte hain
    // taake mutation response foran return ho. Sab values plain hain aur
    // yahan pehle se capture ho chuki hain (koi request-scoped object nahi).
    after(async () => {
      const sideEffects: Promise<unknown>[] = [
        logOfficeAction(session, {
          action: "case.status",
          entity: "Case",
          entityId: id,
          before: { status: item.status, isPrinted: item.isPrinted },
          after: {
            ...data,
            ...(jumpResult ? { attestation: jumpResult.name } : {}),
            ...(adminNote ? { note: adminNote } : {}),
          },
        }),
      ];

      // §W11.8: case creator + naye stage ke department ke users ko notify.
      const newStatus = data.status;
      if (newStatus && newStatus !== item.status) {
        const label =
          newStatus === "ATTESTATION" && jumpResult
            ? `Attestation: ${jumpResult.name}`
            : STATUS_LABELS[newStatus] || newStatus;
        const link = `/office/cases/${id}`;
        sideEffects.push(
          notifyUsers([item.createdByAdminId], {
            type: "case.status",
            title: `Case ${item.caseNumber}: ${label}`,
            body: adminNote,
            link,
          })
        );
        const role = STAGE_ROLE[newStatus];
        if (role) {
          sideEffects.push(
            notifyRole(role, {
              type: "case.status",
              title: `Case ${item.caseNumber}: ${label}`,
              body: adminNote,
              link,
            })
          );
        }
      }
      await Promise.all(sideEffects);
    });

    // Slim response (W12 perf): UI local state + live refresh se re-fetch karti
    // hai, is liye full loadCaseDetail ki heavy queries yahan skip.
    return NextResponse.json({
      ok: true,
      status: data.status ?? item.status,
      currentAttestationId: jumpAttestationId ?? item.currentAttestationId ?? null,
      isPrinted: data.isPrinted ?? item.isPrinted,
      message: "Status update ho gaya",
    });
  } catch (error) {
    return serverError(error);
  }
}

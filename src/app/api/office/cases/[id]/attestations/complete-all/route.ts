import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasAnyPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase, findDeptAccessibleCase } from "@/lib/office/case-access";
import { notifyAdmins, notifyCourierStage, notifyRole } from "@/lib/office/notifications";
import {
  advanceCourierStage,
  autoBridgePrintingForDualDept,
  canCompleteAttestationWithReason,
  evaluateCaseCompletion,
} from "@/lib/office/workflow";
import { creditDeptCommission } from "@/lib/office/dept-commission";
import { cleanText, toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

function utcToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const MIN_REASON_LENGTH = 5;

// "Attestations complete" (F2) — ek click mein case ke TAMAM attestation steps
// DONE + status ATTESTATION_COMPLETE ("final payment pending"). Do raaste:
//   1. Normal: attestation department / attestation office / super admin, jab
//      ATTESTATION FINAL file upload ho chuki ho (§W11.1). Wajah optional.
//   2. §W32 wajah wala: printing, attestation-department YA courier ka user
//      (super admin nahi) — case ka printed proof upload ho chuka ho → FINAL
//      file ke baghair bhi, magar `reason` LAZMI (kam az kam 5 huroof). Wajah
//      audit log + admin ko remark (Remarks tab) mein jati hai.
// Completion ke baad payment poori ho to courier stage (advanceCourierStage).
// Cross-office department worker ko bhi case milta hai (§W18).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const attestationWriter = hasAnyPermission(session, ["office:attestation-dept:write", "office:attestation:write"]);
  const deptUser = hasAnyPermission(session, [
    "office:printing:write",
    "office:attestation-dept:write",
    "office:courier:write",
  ]);
  if (!attestationWriter && !deptUser) return forbidden();

  const { id } = await params;
  try {
    const item =
      (await findAccessibleCase(session, id, { attestations: true })) ??
      (deptUser ? await findDeptAccessibleCase(session, id, { attestations: true }) : null);
    if (!item) return notFound("Case nahi mila");
    if (item.status === "CANCELLED") return badRequest("Cancelled case par ye kaam nahi ho sakta");

    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = cleanText(body?.reason, 500);

    const finalFile = await prisma.caseFile.findFirst({
      where: { caseId: id, department: "ATTESTATION", stepKey: "FINAL" },
      select: { id: true },
    });
    const normalPath = attestationWriter && Boolean(finalFile);
    if (!normalPath) {
      const allowed = await canCompleteAttestationWithReason(session, id);
      if (!allowed) {
        return badRequest(
          deptUser && session.role !== "admin"
            ? "Pehle printed proof upload karein — phir wajah likh kar attestation complete kar sakte hain"
            : "Pehle final file upload karein"
        );
      }
      if (!reason || reason.length < MIN_REASON_LENGTH) {
        return badRequest("Attestation complete karne ki wajah likhna zaroori hai (kam az kam 5 huroof)");
      }
    }
    const reasonPath = !normalPath;

    const now = utcToday();
    const result = await prisma.$transaction(
      async (tx) => {
        // Sab steps DONE; completedDate sirf wahan set jahan null hai.
        await tx.caseAttestation.updateMany({
          where: { caseId: id, status: { not: "DONE" } },
          data: { status: "DONE", completedDate: now },
        });
        await tx.caseAttestation.updateMany({
          where: { caseId: id, status: "DONE", completedDate: null },
          data: { completedDate: now },
        });
        // §F22.5: dual-perm actor (printing + attestation-dept write) ke liye
        // — case WAITING_FOR_PRINTING par ho to pehle auto PRINTED.
        const bridged = await autoBridgePrintingForDualDept(id, session, tx);
        // §W11.1 normal: steps DONE + FINAL → ATTESTATION_COMPLETE.
        // §W32 wajah wala: FINAL zaroori nahi; bina steps wala case bhi.
        const completed = await evaluateCaseCompletion(
          id,
          tx,
          reasonPath ? { allowWithoutFinal: true, allowNoAttestations: true } : {}
        );
        // §W30: payment pehle se poori ho to seedha courier stage.
        const courierStage = completed ? await advanceCourierStage(id, tx) : null;
        const updated = await tx.case.findUnique({ where: { id }, select: { status: true } });
        const attestations = await tx.caseAttestation.findMany({
          where: { caseId: id },
          orderBy: { order: "asc" },
          include: { attestationType: { select: { id: true, name: true } } },
        });
        // §W32: wajah admin ke Remarks tab mein (case ka remark, target ADMIN).
        if (completed && reasonPath && reason) {
          await tx.caseRemark.create({
            data: {
              caseId: id,
              text: `Attestation complete (final file ke baghair) — wajah: ${reason}`,
              createdById: session.adminId,
              createdByRole: session.role || "unknown",
              recipients: { create: [{ target: "ADMIN" }] },
            },
          });
        }
        return { status: updated?.status ?? item.status, attestations, bridged, completed, courierStage };
      },
      { maxWait: 10000, timeout: 30000 }
    );

    // §F22.5: bridge ne case PRINTED kiya → actor ko PRINTING commission.
    if (result.bridged) {
      await creditDeptCommission({ adminId: session.adminId, caseId: id, kind: "PRINTING" });
    }
    // F4: is request ne attestation stage complete kiya → acting user ka
    // ATTESTATION commission (rule na ho to 0; idempotent, never throws).
    if (result.completed) {
      await creditDeptCommission({ adminId: session.adminId, caseId: id, kind: "ATTESTATION" });
    }

    // W13.2: audit log + notifications response ke baad.
    after(async () => {
      await logOfficeAction(session, {
        action: "case.attestations.complete-all",
        entity: "Case",
        entityId: id,
        before: {
          status: item.status,
          attestations: item.attestations.map((a) => ({ id: a.id, status: a.status })),
        },
        after: {
          status: result.status,
          withoutFinalFile: !finalFile,
          ...(reasonPath ? { reason } : {}),
        },
      });

      // §W11.8: attestation stage complete → attestation department + admins.
      if (result.completed) {
        const link = `/office/cases/${id}`;
        const title = `Case ${item.caseNumber}: attestation complete${reasonPath ? " (wajah ke saath)" : ""}`;
        await notifyRole("attestation_dept", { type: "attestation", title, body: reasonPath ? reason : null, link });
        await notifyAdmins({ type: "attestation", title, body: reasonPath ? reason : null, link });
      }
      await notifyCourierStage(id, result.courierStage);
    });

    return NextResponse.json(
      toJson({ status: result.status, completed: result.completed, attestations: result.attestations })
    );
  } catch (error) {
    return serverError(error);
  }
}

import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasAnyPermission, hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase, findDeptAccessibleCase } from "@/lib/office/case-access";
import { notifyAdmins, notifyCourierStage, notifyRole } from "@/lib/office/notifications";
import {
  advanceCourierStage,
  autoBridgePrintingForDualDept,
  canCompleteAttestationWithoutFinal,
  evaluateCaseCompletion,
} from "@/lib/office/workflow";
import { creditDeptCommission } from "@/lib/office/dept-commission";
import { toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

function utcToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// "Attestations complete" (F2): attestation department / attestation office /
// super admin — ek hi click mein case ke TAMAM attestation steps DONE. Shart:
// ATTESTATION department ka stepKey=FINAL file pehle upload ho chuki ho (warna 400). Ek
// transaction mein sab rows DONE, phir evaluateCaseCompletion (jo FINAL file
// dekh kar status ATTESTATION_COMPLETE karti hai, §W11.1).
// §W30:
//   - printing + attestation-department dono ka kaam karne wala user printed
//     proof ke baad FINAL file ke baghair bhi complete kar sakta hai
//     (canCompleteAttestationWithoutFinal).
//   - completion ke baad payment pehle se poori ho to courier stage
//     (advanceCourierStage: address ka intezar / courier slip ka intezar).
//   - cross-office department worker (booking office user + attestation-dept
//     permission) ko bhi case milta hai (files route jaisa §W18 rule).
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  // office:attestation-dept:write ya office:attestation:write (admin dono paas karta hai).
  if (!hasAnyPermission(session, ["office:attestation-dept:write", "office:attestation:write"])) {
    return forbidden();
  }

  const { id } = await params;
  try {
    const item =
      (await findAccessibleCase(session, id, { attestations: true })) ??
      (hasPermission(session, "office:attestation-dept:write")
        ? await findDeptAccessibleCase(session, id, { attestations: true })
        : null);
    if (!item) return notFound("Case nahi mila");
    if (item.status === "CANCELLED") return badRequest("Cancelled case par ye kaam nahi ho sakta");

    const finalFile = await prisma.caseFile.findFirst({
      where: { caseId: id, department: "ATTESTATION", stepKey: "FINAL" },
      select: { id: true },
    });
    const allowWithoutFinal = finalFile ? false : await canCompleteAttestationWithoutFinal(session, id);
    if (!finalFile && !allowWithoutFinal) {
      const dualDept =
        session.role !== "admin" &&
        hasPermission(session, "office:printing:write") &&
        hasPermission(session, "office:attestation-dept:write");
      return badRequest(
        dualDept
          ? "Pehle printed proof upload karein — phir final file ke baghair bhi attestation complete ho sakti hai"
          : "Pehle final file upload karein"
      );
    }

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
        // — case WAITING_FOR_PRINTING par ho to pehle auto PRINTED (isPrinted,
        // printedAt) taake printing step skip na ho; phir completion check.
        const bridged = await autoBridgePrintingForDualDept(id, session, tx);
        // §W11.1: saare set steps DONE + FINAL attestation file → ATTESTATION_COMPLETE
        // (§W30: dual-dept user ke liye FINAL zaroori nahi).
        const completed = await evaluateCaseCompletion(id, tx, { allowWithoutFinal });
        // §W30: payment pehle se poori ho to seedha courier stage.
        const courierStage = completed ? await advanceCourierStage(id, tx) : null;
        const updated = await tx.case.findUnique({ where: { id }, select: { status: true } });
        const attestations = await tx.caseAttestation.findMany({
          where: { caseId: id },
          orderBy: { order: "asc" },
          include: { attestationType: { select: { id: true, name: true } } },
        });
        return { status: updated?.status ?? item.status, attestations, bridged, completed, courierStage };
      },
      { maxWait: 10000, timeout: 30000 }
    );

    // §F22.5: bridge ne case PRINTED kiya → actor ko PRINTING commission
    // (idempotent, never throws) — ATTESTATION credit se pehle.
    if (result.bridged) {
      await creditDeptCommission({ adminId: session.adminId, caseId: id, kind: "PRINTING" });
    }

    // F4: case abhi ATTESTATION_COMPLETE hua (is request se) → acting
    // attestation user ka commission credit (idempotent, never throws).
    // §W30: `completed` flag — status ab courier stage par bhi ho sakta hai.
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
        after: { status: result.status, withoutFinalFile: !finalFile },
      });

      // §W11.8: attestation stage complete → attestation department + admins.
      if (result.completed) {
        const link = `/office/cases/${id}`;
        const title = `Case ${item.caseNumber}: attestation complete`;
        await notifyRole("attestation_dept", { type: "attestation", title, link });
        await notifyAdmins({ type: "attestation", title, link });
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

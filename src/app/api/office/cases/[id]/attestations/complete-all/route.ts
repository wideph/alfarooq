import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasAnyPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { notifyAdmins, notifyRole } from "@/lib/office/notifications";
import { evaluateCaseCompletion } from "@/lib/office/workflow";
import { toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

function utcToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// "Attestations complete" (F2): atta department / attestation office / super
// admin — ek hi click mein case ke TAMAM attestation steps DONE. Shart: ATTA
// department ka stepKey=FINAL file pehle upload ho chuki ho (warna 400). Ek
// transaction mein sab rows DONE, phir evaluateCaseCompletion (jo FINAL file
// dekh kar status ATTESTATION_COMPLETE karti hai, §W11.1).
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  // office:atta:write ya office:attestation:write (admin dono paas karta hai).
  if (!hasAnyPermission(session, ["office:atta:write", "office:attestation:write"])) {
    return forbidden();
  }

  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id, { attestations: true });
    if (!item) return notFound("Case nahi mila");

    const finalFile = await prisma.caseFile.findFirst({
      where: { caseId: id, department: "ATTA", stepKey: "FINAL" },
      select: { id: true },
    });
    if (!finalFile) return badRequest("Pehle final file upload karein");

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
        // §W11.1: saare set steps DONE + FINAL atta file → ATTESTATION_COMPLETE.
        await evaluateCaseCompletion(id, tx);
        const updated = await tx.case.findUnique({ where: { id }, select: { status: true } });
        const attestations = await tx.caseAttestation.findMany({
          where: { caseId: id },
          orderBy: { order: "asc" },
          include: { attestationType: { select: { id: true, name: true } } },
        });
        return { status: updated?.status ?? item.status, attestations };
      },
      { maxWait: 10000, timeout: 30000 }
    );

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
        after: { status: result.status },
      });

      // §W11.8: attestation stage complete → atta department + admins.
      if (result.status === "ATTESTATION_COMPLETE" && item.status !== "ATTESTATION_COMPLETE") {
        const link = `/office/cases/${id}`;
        const title = `Case ${item.caseNumber}: attestation complete`;
        await notifyRole("atta", { type: "attestation", title, link });
        await notifyAdmins({ type: "attestation", title, link });
      }
    });

    return NextResponse.json(toJson({ status: result.status, attestations: result.attestations }));
  } catch (error) {
    return serverError(error);
  }
}

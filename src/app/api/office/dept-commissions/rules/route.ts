import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import {
  DeptCommissionInputError,
  loadDeptCommissionForm,
  saveDeptCommissionForm,
  type DeptCommissionFormInput,
} from "@/lib/office/dept-commission-settings";
import { toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

// ---------------------------------------------------------------------------
// Department commission settings of ONE dept user (§W31 simple form).
// GET ?adminId= → { ok, form: { printing[], attestation[], courierAmount } }
//      printing    — har case category ki raqam
//      attestation — category ke neeche har Set of Attestations ki raqam
//                    (+ bina-set category ki ek raqam)
//      courier     — har delivered case ki ek raqam
// PUT { adminId, printing: [{ categoryId, amount }],
//       attestation: [{ setId, amount } | { categoryId, amount }],
//       courierAmount } → poora form replace (khali / 0 = commission 0).
// Rate badalna sirf AAGE ke events par lagta hai — pehle se credit hui
// DEPT_COMMISSION ledger entries ko yahan koi nahi chhuta.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  // Admin only (office:ledger:read covers super admin; cashier included).
  if (!hasPermission(session, "office:ledger:read")) return forbidden();

  const adminId = new URL(request.url).searchParams.get("adminId") || "";
  if (!adminId) return badRequest("adminId zaroori hai");

  try {
    return NextResponse.json(toJson({ ok: true, form: await loadDeptCommissionForm(adminId) }));
  } catch (error) {
    return serverError(error);
  }
}

export async function PUT(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  // Commission mutation is super-admin only.
  if (session.role !== "admin") return forbidden("Commission sirf super admin badal sakta hai");

  try {
    const body = (await request.json().catch(() => null)) as (DeptCommissionFormInput & { adminId?: unknown }) | null;
    if (!body || typeof body !== "object") return badRequest("Request sahi nahi hai");
    const adminId = typeof body.adminId === "string" ? body.adminId : "";
    if (!adminId) return badRequest("adminId zaroori hai");
    const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { id: true } });
    if (!admin) return notFound("User nahi mila");

    const before = await loadDeptCommissionForm(adminId);
    let form;
    try {
      form = await saveDeptCommissionForm(adminId, body);
    } catch (error) {
      if (error instanceof DeptCommissionInputError) return badRequest(error.message);
      throw error;
    }

    after(async () => {
      await logOfficeAction(session, {
        action: "dept-commission.settings.update",
        entity: "DepartmentCommissionRule",
        entityId: adminId,
        before,
        after: form,
      });
    });

    return NextResponse.json(toJson({ ok: true, form }));
  } catch (error) {
    return serverError(error);
  }
}

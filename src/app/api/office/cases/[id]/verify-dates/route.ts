import { NextRequest, NextResponse } from "next/server";
import { guardOffice, notFound, serverError } from "@/lib/office/guard";
import { deptPermissionsOf, findAccessibleCase, findDeptAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { verifyCaseDates } from "@/lib/office/date-verify";

export const preferredRegion = ["sin1"];
// Online khabrein + AI (reasoning model) — kai minute lag sakte hain.
export const maxDuration = 300;

type RouteParams = { params: Promise<{ id: string }> };

// §W61 — case ki pending attestation dates ka ONLINE check (Tavily khabrein +
// attached AI) jab tak sab confirm na hon. Case page "AI check baqi" dekh kar
// isay khud bulata hai (after() ka waqt khatam ho gaya ho to bhi kaam poora
// ho). Ek case par ek waqt mein ek check (busy → foran wapas).
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item =
      (await findAccessibleCase(session, id)) ??
      (deptPermissionsOf(session).length > 0 ? await findDeptAccessibleCase(session, id) : null);
    if (!item) return notFound("Case nahi mila");
    const result = await verifyCaseDates(id, { actor: session, budgetMs: 240_000 });
    const detail = await loadCaseDetail(session, id);
    return NextResponse.json({ verify: result, detail });
  } catch (error) {
    return serverError(error);
  }
}

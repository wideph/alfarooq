import { NextRequest, NextResponse } from "next/server";
import { recheckOpenCaseDates, SYSTEM_ACTOR } from "@/lib/office/date-recheck";
import { verifyAllOpenDates } from "@/lib/office/date-verify";

export const preferredRegion = ["sin1"];
export const maxDuration = 300;

// §W60/§W61 — roz subah: (1) 20 din ke andar ki har pending attestation date
// aur expected printing date ka ONLINE check (Tavily khabrein + attached AI) —
// achanak elaan shuda chhutti mile to dates aage + remark; (2) tamam khule
// cases ki dates ki aam jaanch (chhutti / tarteeb / khali) + printing dates.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const verify = await verifyAllOpenDates({ budgetMs: 200_000 });
  const result = await recheckOpenCaseDates(SYSTEM_ACTOR);
  return NextResponse.json({
    success: true,
    verify,
    checked: result.checked,
    fixedCases: result.fixes.length,
    ranAt: new Date().toISOString(),
  });
}

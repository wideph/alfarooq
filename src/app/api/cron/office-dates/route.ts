import { NextRequest, NextResponse } from "next/server";
import { recheckOpenCaseDates, SYSTEM_ACTOR } from "@/lib/office/date-recheck";
import { verifyAllOpenDates } from "@/lib/office/date-verify";

export const preferredRegion = ["sin1"];
export const maxDuration = 300;

// §W60/§W61 — roz subah:
//   1) PEHLE purani (bina AI) jaanch — built-in calendar + Holidays table +
//      weekend + tarteeb: chhutti / tarteeb ke khilaf date aage, khali bhari,
//      expected printing dates. Ye hamesha chalti hai (AI ho na ho).
//   2) PHIR bache waqt mein ONLINE check (Tavily khabrein + attached AI) — 20
//      din ke andar ki pending dates; achanak chhutti mile to date aage +
//      remark. AI / Tavily fail ho to bas ye hissa chhoot jata hai.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const result = await recheckOpenCaseDates(SYSTEM_ACTOR);
  let verify: unknown = null;
  try {
    // 300s mein se: jitna bacha, us mein se 30s ki gunjaish chhor kar.
    verify = await verifyAllOpenDates({ budgetMs: Math.max(0, 270_000 - (Date.now() - started)) });
  } catch (error) {
    console.error("[office] cron online verify fail", error);
    verify = { error: error instanceof Error ? error.message : "fail" };
  }
  return NextResponse.json({
    success: true,
    checked: result.checked,
    fixedCases: result.fixes.length,
    verify,
    ranAt: new Date().toISOString(),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { recheckOpenCaseDates, SYSTEM_ACTOR } from "@/lib/office/date-recheck";

export const preferredRegion = ["sin1"];
export const maxDuration = 300;

// §W60 — roz subah: aane wali pending attestation dates par AI research
// (naye band din / announcements), phir tamam khule cases ki dates ki jaanch
// (chhutti / tarteeb → aage + remark, khali → bhari) aur expected printing dates.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await recheckOpenCaseDates(SYSTEM_ACTOR, { research: true });
  return NextResponse.json({
    success: true,
    checked: result.checked,
    newClosures: result.newClosures,
    fixedCases: result.fixes.length,
    ranAt: new Date().toISOString(),
  });
}

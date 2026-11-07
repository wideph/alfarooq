import { NextResponse, after } from "next/server";
import { guardOffice, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { recheckOpenCaseDates } from "@/lib/office/date-recheck";
import { verifyAllOpenDates } from "@/lib/office/date-verify";

export const preferredRegion = ["sin1"];
export const maxDuration = 300;

// §W60 — admin: "Sab dates check karein". Tamam khule cases ki pending
// attestation dates: chhutti / band din ya tarteeb ke khilaf → aage (remark ke
// saath), khali → bhar di jati hain; expected printing dates bhi. Foran.
// §W61: response ke baad 20 din ke andar ki har date ka ONLINE check (Tavily
// khabrein + attached AI); chhutti mile to dates phir aage.
export async function POST() {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const actor = { adminId: session.adminId, role: session.role || "admin" };
    const result = await recheckOpenCaseDates(actor);
    after(async () => {
      try {
        await verifyAllOpenDates({ actor, budgetMs: 240_000 });
      } catch (error) {
        console.error("[office] recheck online verify fail", error);
      }
      await logOfficeAction(session, {
        action: "dates.recheck",
        entity: "Case",
        entityId: "all",
        after: {
          checked: result.checked,
          fixes: result.fixes.map((fix) => ({ caseNumber: fix.caseNumber, moved: fix.moved, filled: fix.filled })),
        },
      });
    });
    return NextResponse.json(result);
  } catch (error) {
    return serverError(error);
  }
}

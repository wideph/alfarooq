import { NextRequest, NextResponse, after } from "next/server";
import { badRequest, forbidden, guardOffice, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { CASE_STATUSES, LEGACY_CASE_STATUSES } from "@/lib/office/permissions";
import { markAllCasesRead, markCasesRead, tracksCaseReads, unreadCaseCount } from "@/lib/office/case-read";

export const preferredRegion = ["sin1"];

const MAX_ITEMS = 200;
const KNOWN_STATUSES: readonly string[] = [...CASE_STATUSES, ...LEGACY_CASE_STATUSES];

// §W35 — Cases tab ka "Read" (super admin). POST { items: [{ id, status }] }
// (row ka status jo user ne dekha) ya { all: true }. Case doosri queue mein
// jaye to phir unread (lib/office/case-read.ts). Jawab mein naya unread count.
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (!tracksCaseReads(session)) return forbidden("Read / unread sirf super admin ke liye hai");
  try {
    const body = (await request.json().catch(() => null)) as { items?: unknown; all?: unknown } | null;

    let marked: number;
    let entityId: string;
    if (body?.all === true) {
      marked = await markAllCasesRead(session.adminId);
      entityId = "all";
    } else {
      const items = Array.isArray(body?.items)
        ? (body.items as unknown[])
            .map((raw) => raw as { id?: unknown; status?: unknown })
            .filter(
              (raw): raw is { id: string; status: string } =>
                typeof raw?.id === "string" &&
                raw.id.length > 0 &&
                typeof raw.status === "string" &&
                KNOWN_STATUSES.includes(raw.status)
            )
            .map((raw) => ({ id: raw.id, status: raw.status }))
        : [];
      if (items.length === 0) return badRequest("Koi case select nahi kiya");
      if (items.length > MAX_ITEMS) return badRequest(`Ek dafa mein zyada se zyada ${MAX_ITEMS} cases`);
      marked = await markCasesRead(session.adminId, items);
      entityId = items.length === 1 ? items[0].id : `${items.length} cases`;
    }

    after(async () => {
      await logOfficeAction(session, {
        action: "case.read",
        entity: "Case",
        entityId,
        after: { marked },
      });
    });

    return NextResponse.json({ ok: true, marked, unread: await unreadCaseCount(session.adminId) });
  } catch (error) {
    return serverError(error);
  }
}

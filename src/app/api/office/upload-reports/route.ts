import { NextRequest, NextResponse, after } from "next/server";
import { badRequest, guardOffice, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { CASE_DEPARTMENTS } from "@/lib/office/workflow";

export const preferredRegion = ["sin1"];

const MAX_ITEMS = 20;
const STAGES = ["presign", "put", "register", "server", "too-big", "network"] as const;

type RawItem = {
  name?: unknown;
  size?: unknown;
  type?: unknown;
  stage?: unknown;
  status?: unknown;
  error?: unknown;
  recovered?: unknown;
};

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

// §W37 — browser upload ka masla server par record (OfficeAuditLog). Browser
// se R2 ka direct PUT (CORS) ya register fail ho to user ko sirf toast milta
// tha — wajah kahin save nahi hoti thi. Ab: kis stage par (presign / R2 PUT /
// register / server raasta / CORS ke baghair bari file), HTTP status, file ka
// size/type aur bucket CORS ki halat. `recovered` = direct fail hua magar
// server raaste se save ho gayi. Koi business data nahi badalta.
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => null)) as {
      caseId?: unknown;
      department?: unknown;
      corsReady?: unknown;
      items?: unknown;
    } | null;
    const caseId = text(body?.caseId, 40);
    const department = text(body?.department, 20).toUpperCase();
    if (!caseId || !(CASE_DEPARTMENTS as readonly string[]).includes(department)) {
      return badRequest("Report sahi nahi hai");
    }
    const items = (Array.isArray(body?.items) ? (body.items as RawItem[]) : []).slice(0, MAX_ITEMS).map((item) => ({
      name: text(item?.name, 120),
      size: Number(item?.size) || 0,
      type: text(item?.type, 80),
      stage: (STAGES as readonly string[]).includes(text(item?.stage, 20)) ? text(item?.stage, 20) : "unknown",
      status: Number(item?.status) || null,
      error: text(item?.error, 300),
      recovered: item?.recovered === true,
    }));
    if (items.length === 0) return badRequest("Report khali hai");

    const failed = items.some((item) => !item.recovered);
    after(async () => {
      await logOfficeAction(session, {
        action: failed ? "case.file.upload.failed" : "case.file.upload.fallback",
        entity: "Case",
        entityId: caseId,
        after: {
          department,
          corsReady: typeof body?.corsReady === "boolean" ? body.corsReady : null,
          origin: request.headers.get("origin"),
          userAgent: text(request.headers.get("user-agent"), 160),
          items,
        },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}

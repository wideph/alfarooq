import { NextRequest, NextResponse, after } from "next/server";
import { getSession } from "@/lib/auth";
import { logOfficeAction } from "@/lib/office/audit";

export const preferredRegion = ["sin1"];

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

// §W38 — admin / office page crash ("Application error") ki tafseel audit log
// mein (components/SegmentError). Pehle browser ka error kahin save nahi hota
// tha. `translated` = Chrome ne page ka tarjuma kiya hua tha (Google Translate
// ka DOM badlaav React ko crash karta hai). Koi business data nahi badalta;
// login zaroori (kisi bhi admin / office user ke liye).
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Login zaroori hai" }, { status: 401 });
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const path = text(body?.path, 200);
    if (!path) return NextResponse.json({ error: "Report sahi nahi hai" }, { status: 400 });
    after(async () => {
      await logOfficeAction(session, {
        action: "client.error",
        entity: "Page",
        entityId: path,
        after: {
          name: text(body?.name, 80),
          message: text(body?.message, 400),
          digest: text(body?.digest, 80),
          translated: body?.translated === true,
          userAgent: text(request.headers.get("user-agent"), 160),
        },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request fail" }, { status: 500 });
  }
}

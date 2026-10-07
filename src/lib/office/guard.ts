import { NextResponse } from "next/server";
import { requirePermission, type AdminPermission, type AdminSession } from "@/lib/auth";

// Same pattern as src/app/api/admin/users/route.ts, shared by all office routes:
//   const { session, denied } = await guardOffice("office:cases:read");
//   if (denied) return denied;
export async function guardOffice(
  permission: AdminPermission
): Promise<{ session: AdminSession; denied: null } | { session: null; denied: NextResponse }> {
  try {
    return { session: await requirePermission(permission), denied: null };
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return {
      session: null,
      denied: NextResponse.json({ error: "Unauthorized" }, { status }),
    };
  }
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Record nahi mila") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function forbidden(message = "Is action ki permission nahi hai") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function serverError(error: unknown, fallback = "Request fail ho gayi") {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

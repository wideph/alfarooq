import { NextResponse } from "next/server";
import { getFreshAdminSession, getSession, refreshSessionCookie, type AdminSession } from "@/lib/auth";

export const preferredRegion = ["sin1"];

// Same rule as requirePermission: JWTs younger than 15 min are trusted as-is
// (no cross-region DB round trip on every page/frame load). Older tokens
// re-check the admin row once so deactivated accounts are still kicked out.
const FRESH_SESSION_MAX_AGE_MS = 15 * 60 * 1000;

// JWT payload may carry iat/exp — strip them so the response shape matches
// the DB-backed session exactly.
function sessionFromJwt(session: AdminSession & { iat?: number; exp?: number }): AdminSession {
  return {
    adminId: session.adminId,
    email: session.email,
    name: session.name,
    role: session.role,
    permissions: session.permissions,
    bookingOfficeId: session.bookingOfficeId,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const iat = (session as AdminSession & { iat?: number }).iat;
  const isFresh = typeof iat === "number" && Date.now() - iat * 1000 < FRESH_SESSION_MAX_AGE_MS;
  if (isFresh) {
    // Fast path: signed JWT claims are enough (no DB query).
    return NextResponse.json({ authenticated: true, admin: sessionFromJwt(session) });
  }

  const fresh = await getFreshAdminSession();
  if (!fresh) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  // Sliding refresh (W13.1): stale-but-valid token gets a fresh iat so all
  // subsequent API calls take the zero-DB fast path in requirePermission.
  const response = NextResponse.json({ authenticated: true, admin: fresh });
  await refreshSessionCookie(response, fresh);
  return response;
}

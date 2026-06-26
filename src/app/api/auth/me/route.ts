import { NextResponse } from "next/server";
import { getFreshAdminSession } from "@/lib/auth";

export async function GET() {
  const session = await getFreshAdminSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, admin: session });
}

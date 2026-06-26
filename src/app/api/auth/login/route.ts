import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, parsePermissions } from "@/lib/auth";
import { ensureAdminFromEnv } from "@/lib/ensure-admin";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email aur password zaroori hain" },
        { status: 400 }
      );
    }

    const envEmail = process.env.ADMIN_EMAIL?.trim();
    if (envEmail && email === envEmail) {
      await ensureAdminFromEnv();
    }

    const admin = await prisma.admin.findUnique({ where: { email } });

    if (!admin || !admin.isActive) {
      return NextResponse.json(
        { error: "Galat email ya password" },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Galat email ya password" },
        { status: 401 }
      );
    }

    const token = await createSession({
      adminId: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      permissions: parsePermissions(admin.permissions),
    });

    await prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const response = NextResponse.json({
      success: true,
      admin: {
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: parsePermissions(admin.permissions),
      },
    });

    response.cookies.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Login fail ho gaya" }, { status: 500 });
  }
}

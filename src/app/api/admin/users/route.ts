import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  ADMIN_PERMISSIONS,
  parsePermissions,
  requirePermission,
  type AdminPermission,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function sanitizePermissions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AdminPermission =>
    ADMIN_PERMISSIONS.includes(item as AdminPermission)
  );
}

function serializeAdmin(admin: {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}) {
  return {
    ...admin,
    permissions: parsePermissions(admin.permissions),
  };
}

async function ensureAdminPermission(permission: "admins:read" | "admins:write") {
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

export async function GET() {
  const { denied } = await ensureAdminPermission("admins:read");
  if (denied) return denied;

  const admins = await prisma.admin.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  return NextResponse.json(admins.map(serializeAdmin));
}

export async function POST(request: NextRequest) {
  const { session, denied } = await ensureAdminPermission("admins:write");
  if (denied) return denied;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const permissions = sanitizePermissions(body.permissions);

    if (!name || !email || password.length < 6) {
      return NextResponse.json(
        { error: "Name, email aur 6 character password zaroori hai" },
        { status: 400 }
      );
    }

    const admin = await prisma.admin.create({
      data: {
        name,
        email,
        password: await bcrypt.hash(password, 10),
        role: "sub_admin",
        permissions: JSON.stringify(permissions),
        isActive: true,
        createdByAdmin: session.adminId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    return NextResponse.json(serializeAdmin(admin), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sub admin create fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { session, denied } = await ensureAdminPermission("admins:write");
  if (denied) return denied;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const existing = await prisma.admin.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Admin nahi mila" }, { status: 404 });
    }

    if (existing.role === "admin" && existing.id !== session.adminId) {
      return NextResponse.json(
        { error: "Main admin ko yahan se edit nahi kar sakte" },
        { status: 403 }
      );
    }

    const password = typeof body.password === "string" ? body.password : "";
    const permissions = sanitizePermissions(body.permissions);

    const admin = await prisma.admin.update({
      where: { id },
      data: {
        ...(typeof body.name === "string" && body.name.trim()
          ? { name: body.name.trim() }
          : {}),
        ...(typeof body.email === "string" && body.email.trim()
          ? { email: body.email.trim().toLowerCase() }
          : {}),
        ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
        ...(existing.role === "sub_admin"
          ? {
              permissions: JSON.stringify(permissions),
              isActive: body.isActive !== false,
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    return NextResponse.json(serializeAdmin(admin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sub admin update fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { denied } = await ensureAdminPermission("admins:write");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const existing = await prisma.admin.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Admin nahi mila" }, { status: 404 });
  }

  if (existing.role !== "sub_admin") {
    return NextResponse.json({ error: "Main admin delete nahi ho sakta" }, { status: 403 });
  }

  await prisma.admin.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

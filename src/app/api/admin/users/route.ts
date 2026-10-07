import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  ADMIN_PERMISSIONS,
  parsePermissions,
  requirePermission,
  type AdminPermission,
  type AdminSession,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOfficeRole } from "@/lib/office/permissions";

const ASSIGNABLE_ROLES = ["sub_admin", "cashier", "attestation", "booking_office"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

function sanitizePermissions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AdminPermission =>
    ADMIN_PERMISSIONS.includes(item as AdminPermission)
  );
}

const adminSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  permissions: true,
  isActive: true,
  createdAt: true,
  lastLoginAt: true,
  bookingOfficeId: true,
  bookingOffice: { select: { id: true, name: true, type: true } },
} as const;

function serializeAdmin(admin: {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  bookingOfficeId: string | null;
  bookingOffice: { id: string; name: string; type: string } | null;
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

// Office roles (cashier / attestation / booking_office) can only be granted by
// the super admin. Website sub-admins with admins:write manage sub_admins only.
async function resolveRole(
  session: AdminSession,
  rawRole: unknown,
  rawBookingOfficeId: unknown
): Promise<{ role: AssignableRole; bookingOfficeId: string | null } | { error: string }> {
  const role = (typeof rawRole === "string" && rawRole ? rawRole : "sub_admin") as AssignableRole;
  if (!ASSIGNABLE_ROLES.includes(role)) return { error: "Role sahi nahi hai" };
  if (isOfficeRole(role) && session.role !== "admin") {
    return { error: "Office roles sirf super admin bana sakta hai" };
  }

  if (role !== "booking_office") return { role, bookingOfficeId: null };

  const bookingOfficeId = typeof rawBookingOfficeId === "string" ? rawBookingOfficeId : "";
  if (!bookingOfficeId) return { error: "Booking office user ke liye office select karein" };
  const office = await prisma.bookingOffice.findUnique({ where: { id: bookingOfficeId } });
  if (!office) return { error: "Booking office nahi mila" };
  return { role, bookingOfficeId };
}

// booking_office users are also a BookingOfficeMember (shareholder/staff row)
// so ledger entries and profit % can target them.
async function syncOfficeMember(adminId: string, name: string, bookingOfficeId: string | null) {
  if (!bookingOfficeId) return;
  const existing = await prisma.bookingOfficeMember.findUnique({ where: { adminId } });
  if (existing) {
    await prisma.bookingOfficeMember.update({
      where: { adminId },
      data: { bookingOfficeId, name, isActive: true },
    });
  } else {
    await prisma.bookingOfficeMember.create({ data: { adminId, name, bookingOfficeId } });
  }
}

export async function GET() {
  const { denied } = await ensureAdminPermission("admins:read");
  if (denied) return denied;

  const admins = await prisma.admin.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: adminSelect,
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

    const resolved = await resolveRole(session, body.role, body.bookingOfficeId);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });

    const admin = await prisma.admin.create({
      data: {
        name,
        email,
        password: await bcrypt.hash(password, 10),
        role: resolved.role,
        bookingOfficeId: resolved.bookingOfficeId,
        permissions: JSON.stringify(permissions),
        isActive: true,
        createdByAdmin: session.adminId,
      },
      select: adminSelect,
    });

    await syncOfficeMember(admin.id, name, resolved.bookingOfficeId);

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

    if (isOfficeRole(existing.role) && session.role !== "admin") {
      return NextResponse.json(
        { error: "Office users sirf super admin edit kar sakta hai" },
        { status: 403 }
      );
    }

    const password = typeof body.password === "string" ? body.password : "";
    const permissions = sanitizePermissions(body.permissions);

    let roleData: { role: string; bookingOfficeId: string | null } | null = null;
    if (existing.role !== "admin") {
      const resolved = await resolveRole(
        session,
        body.role ?? existing.role,
        body.bookingOfficeId ?? existing.bookingOfficeId
      );
      if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });
      roleData = resolved;
    }

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
        ...(roleData
          ? {
              role: roleData.role,
              bookingOfficeId: roleData.bookingOfficeId,
              permissions: JSON.stringify(permissions),
              isActive: body.isActive !== false,
            }
          : {}),
      },
      select: adminSelect,
    });

    if (roleData) await syncOfficeMember(admin.id, admin.name, roleData.bookingOfficeId);

    return NextResponse.json(serializeAdmin(admin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sub admin update fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await ensureAdminPermission("admins:write");
  if (denied) return denied;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const existing = await prisma.admin.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Admin nahi mila" }, { status: 404 });
  }

  if (existing.role === "admin") {
    return NextResponse.json({ error: "Main admin delete nahi ho sakta" }, { status: 403 });
  }

  if (isOfficeRole(existing.role) && session.role !== "admin") {
    return NextResponse.json(
      { error: "Office users sirf super admin delete kar sakta hai" },
      { status: 403 }
    );
  }

  // Member row (ledger history) stays; only the login link is removed.
  await prisma.admin.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-key"
);

export const ADMIN_PERMISSIONS = [
  "settings:read",
  "settings:write",
  "courses:read",
  "courses:write",
  "samples:read",
  "samples:write",
  "qa:read",
  "qa:write",
  "userQuestions:read",
  "userQuestions:write",
  "visitors:read",
  "visitors:write",
  "botTraining:read",
  "botTraining:write",
  "botChats:read",
  "botChats:write",
  "admins:read",
  "admins:write",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const LEGACY_PERMISSION_MAP: Record<string, AdminPermission[]> = {
  manageSettings: ["settings:read", "settings:write"],
  manageCourses: ["courses:read", "courses:write"],
  manageContent: [
    "samples:read",
    "samples:write",
    "qa:read",
    "qa:write",
    "userQuestions:read",
    "userQuestions:write",
  ],
  manageVisitors: ["visitors:read", "visitors:write"],
  manageBot: [
    "botTraining:read",
    "botTraining:write",
    "botChats:read",
    "botChats:write",
  ],
  manageAdmins: ["admins:read", "admins:write"],
};

export interface AdminSession {
  adminId: string;
  email: string;
  name: string;
  role?: string;
  permissions?: AdminPermission[];
}

export function parsePermissions(value: string | null | undefined): AdminPermission[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const permissions = parsed.flatMap((item) => {
      if (ADMIN_PERMISSIONS.includes(item as AdminPermission)) {
        return [item as AdminPermission];
      }
      return LEGACY_PERMISSION_MAP[String(item)] || [];
    });
    return [...new Set(permissions)];
  } catch {
    return [];
  }
}

export function hasPermission(
  session: AdminSession | null,
  permission: AdminPermission
): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (session.permissions?.includes(permission)) return true;

  if (permission.endsWith(":read")) {
    const writePermission = permission.replace(":read", ":write") as AdminPermission;
    return Boolean(session.permissions?.includes(writePermission));
  }

  return false;
}

export function hasAnyPermission(
  session: AdminSession | null,
  permissions: AdminPermission[]
): boolean {
  return permissions.some((permission) => hasPermission(session, permission));
}

export async function createSession(payload: AdminSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as AdminSession;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireAdmin(): Promise<AdminSession> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requirePermission(
  permission: AdminPermission
): Promise<AdminSession> {
  const session = await getFreshAdminSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  if (!hasPermission(session, permission)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function getFreshAdminSession(): Promise<AdminSession | null> {
  const session = await getSession();
  if (!session) return null;

  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      isActive: true,
    },
  });

  if (!admin?.isActive) return null;

  return {
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    permissions: parsePermissions(admin.permissions),
  };
}

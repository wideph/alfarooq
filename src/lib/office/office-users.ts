import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import type { AdminSession } from "@/lib/auth";
import { logOfficeAction } from "@/lib/office/audit";
import { OFFICE_ROLES, ROLE_LABELS, ROLE_PRESETS, type OfficeRole } from "@/lib/office/permissions";

type Db = Prisma.TransactionClient;

export type OfficeUserInput = {
  name: string;
  email: string;
  password: string;
  role: OfficeRole;
};

// bcrypt hashing is pure CPU work — it runs OUTSIDE the interactive
// transaction (see hashOfficeUserPassword) so tx time stays pure DB work.
export type OfficeUserHashedInput = Omit<OfficeUserInput, "password"> & {
  passwordHash: string;
};

export async function hashOfficeUserPassword(input: OfficeUserInput): Promise<OfficeUserHashedInput> {
  const { password, ...rest } = input;
  return { ...rest, passwordHash: await bcrypt.hash(password, 10) };
}

// Mirrors the validation in src/app/api/admin/users/route.ts, but for ALL
// office roles (docs 06_NEW_REQUIREMENTS.md N2).
export function validateOfficeUser(raw: unknown): { data: OfficeUserInput } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "User ki maloomat sahi nahi hai" };
  const body = raw as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 160) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = typeof body.role === "string" ? (body.role as OfficeRole) : ("" as OfficeRole);

  if (!name) return { error: "User ka naam zaroori hai" };
  if (!email || !email.includes("@")) return { error: `User "${name}" ka email sahi nahi hai` };
  if (password.length < 6) return { error: `User "${name}" ka password kam az kam 6 characters ho` };
  if (!OFFICE_ROLES.includes(role)) {
    return { error: `User "${name}" ka role sahi nahi hai` };
  }
  return { data: { name, email, password, role } };
}

// Creates the Admin login (+ linked BookingOfficeMember for booking_office
// users, same as syncOfficeMember in /api/admin/users) inside the caller's
// transaction and writes an audit row. Throws if the email already exists.
export async function createOfficeUser(
  tx: Db,
  session: AdminSession,
  bookingOfficeId: string,
  input: OfficeUserHashedInput
) {
  const taken = await tx.admin.findUnique({ where: { email: input.email } });
  if (taken) throw new Error(`Email "${input.email}" pehle se registered hai`);

  const admin = await tx.admin.create({
    data: {
      name: input.name,
      email: input.email,
      password: input.passwordHash,
      role: input.role,
      bookingOfficeId,
      permissions: JSON.stringify(ROLE_PRESETS[input.role]),
      isActive: true,
      createdByAdmin: session.adminId,
    },
  });

  // booking_office users are also a BookingOfficeMember (shareholder/staff
  // row) so ledger entries and profit % can target them.
  if (input.role === "booking_office") {
    const existing = await tx.bookingOfficeMember.findUnique({ where: { adminId: admin.id } });
    if (!existing) {
      await tx.bookingOfficeMember.create({
        data: { adminId: admin.id, name: input.name, bookingOfficeId },
      });
    }
  }

  await logOfficeAction(
    session,
    {
      action: "office_user.create",
      entity: "Admin",
      entityId: admin.id,
      after: {
        name: admin.name,
        email: admin.email,
        role: admin.role,
        roleLabel: ROLE_LABELS[admin.role] || admin.role,
        bookingOfficeId,
      },
    },
    tx
  );

  return admin;
}

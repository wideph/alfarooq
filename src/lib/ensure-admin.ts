import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const globalForAdminSync = globalThis as unknown as { adminEnvSynced?: boolean };

/**
 * Syncs Admin row with env vars only when missing or password changed.
 * Skips expensive bcrypt.hash when credentials already match.
 */
export async function ensureAdminFromEnv() {
  if (globalForAdminSync.adminEnvSynced) return;

  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    globalForAdminSync.adminEnvSynced = true;
    return;
  }

  const existing = await prisma.admin.findUnique({
    where: { email },
    select: { password: true, role: true, isActive: true },
  });

  if (
    existing &&
    existing.role === "admin" &&
    existing.isActive &&
    (await bcrypt.compare(password, existing.password))
  ) {
    globalForAdminSync.adminEnvSynced = true;
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.admin.upsert({
    where: { email },
    update: { password: hashedPassword, role: "admin", isActive: true },
    create: {
      email,
      password: hashedPassword,
      name: "Alfarooq Admin",
      role: "admin",
      permissions: "[]",
      isActive: true,
    },
  });

  globalForAdminSync.adminEnvSynced = true;
}

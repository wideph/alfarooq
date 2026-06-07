import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const globalForAdminSync = globalThis as unknown as { adminEnvSynced?: boolean };

/**
 * Keeps the Admin row in sync with ADMIN_EMAIL / ADMIN_PASSWORD env vars.
 * Login reads from the database, not env directly — this runs once per server instance.
 */
export async function ensureAdminFromEnv() {
  if (globalForAdminSync.adminEnvSynced) return;

  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return;

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.admin.upsert({
    where: { email },
    update: { password: hashedPassword },
    create: {
      email,
      password: hashedPassword,
      name: "Alfarooq Admin",
    },
  });

  globalForAdminSync.adminEnvSynced = true;
}

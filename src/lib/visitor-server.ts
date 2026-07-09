import type { Prisma, Visitor } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Per-deployment canonical host; when unset, tracked URLs keep their own host.
const CANONICAL_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_PUBLIC_URL || "";

export function canonicalizeTrackedUrl(value: string | null | undefined) {
  if (!value) return null;
  if (!CANONICAL_SITE_URL) return value;

  try {
    const url = new URL(value);
    const canonical = new URL(CANONICAL_SITE_URL);

    if (
      url.hostname.endsWith(".vercel.app") &&
      url.hostname !== canonical.hostname
    ) {
      url.protocol = canonical.protocol;
      url.host = canonical.host;
      return url.toString();
    }

    return value;
  } catch {
    return value;
  }
}

function cleanIp(value: string | null | undefined) {
  const ip = (value || "").split(",")[0]?.trim();
  if (!ip || ip.length > 80) return null;
  return ip;
}

export function getClientIpFromHeaders(headers: Headers) {
  return (
    cleanIp(headers.get("x-forwarded-for")) ||
    cleanIp(headers.get("x-real-ip")) ||
    cleanIp(headers.get("cf-connecting-ip")) ||
    cleanIp(headers.get("true-client-ip"))
  );
}

export async function findBlockedVisitorByIp(ipAddress: string | null | undefined) {
  if (!ipAddress) return null;

  return prisma.visitor.findFirst({
    where: { ipAddress, status: "blocked" },
    orderBy: { updatedAt: "desc" },
  });
}

async function mergeVisitorRecords(primary: Visitor, duplicate: Visitor) {
  if (primary.id === duplicate.id) return primary;

  await prisma.$transaction([
    prisma.botConversation.updateMany({
      where: { visitorId: duplicate.id },
      data: { visitorId: primary.id },
    }),
    prisma.userQuestion.updateMany({
      where: { visitorId: duplicate.id },
      data: { visitorId: primary.id },
    }),
    prisma.visitorEvent.updateMany({
      where: { visitorId: duplicate.id },
      data: { visitorId: primary.id },
    }),
    prisma.visitor.update({
      where: { id: primary.id },
      data: {
        source: primary.source || duplicate.source,
        medium: primary.medium || duplicate.medium,
        campaign: primary.campaign || duplicate.campaign,
        referrer: primary.referrer || duplicate.referrer,
        landingPage: primary.landingPage || duplicate.landingPage,
        currentPath: primary.currentPath || duplicate.currentPath,
        ipAddress: primary.ipAddress || duplicate.ipAddress,
        status:
          primary.status === "blocked" || duplicate.status === "blocked"
            ? "blocked"
            : primary.status,
        timeSpentSeconds: { increment: duplicate.timeSpentSeconds },
        firstSeenAt:
          duplicate.firstSeenAt < primary.firstSeenAt
            ? duplicate.firstSeenAt
            : primary.firstSeenAt,
        lastSeenAt:
          duplicate.lastSeenAt > primary.lastSeenAt
            ? duplicate.lastSeenAt
            : primary.lastSeenAt,
      },
    }),
    prisma.visitor.delete({ where: { id: duplicate.id } }),
  ]);

  return prisma.visitor.findUniqueOrThrow({ where: { id: primary.id } });
}

export async function findOrCreateMergedVisitor({
  visitorKey,
  previousVisitorKey,
  create,
  update,
}: {
  visitorKey: string;
  previousVisitorKey?: string | null;
  create: Omit<Prisma.VisitorCreateInput, "visitorKey">;
  update?: Prisma.VisitorUpdateInput;
}) {
  const previousKey =
    previousVisitorKey && previousVisitorKey !== visitorKey ? previousVisitorKey : null;

  const [existing, previous] = await Promise.all([
    prisma.visitor.findUnique({ where: { visitorKey } }),
    previousKey
      ? prisma.visitor.findUnique({ where: { visitorKey: previousKey } })
      : Promise.resolve(null),
  ]);

  if (existing && previous && existing.id !== previous.id) {
    const merged = await mergeVisitorRecords(existing, previous);
    return prisma.visitor.update({
      where: { id: merged.id },
      data: update || {},
    });
  }

  if (existing) {
    return prisma.visitor.update({
      where: { id: existing.id },
      data: update || {},
    });
  }

  if (previous) {
    try {
      return await prisma.visitor.update({
        where: { id: previous.id },
        data: {
          visitorKey,
          ...(update || {}),
        },
      });
    } catch {
      const latestExisting = await prisma.visitor.findUnique({ where: { visitorKey } });
      if (latestExisting) {
        return mergeVisitorRecords(latestExisting, previous);
      }
      throw new Error("Visitor ID update fail");
    }
  }

  return prisma.visitor.create({
    data: {
      visitorKey,
      ...create,
    },
  });
}

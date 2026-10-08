import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardOffice, serverError } from "@/lib/office/guard";
import { toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

// GET — current user ki latest 20 notifications + unread count (bell dropdown
// 20s polling se call karta hai, §W11.8).
export async function GET() {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  try {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: session.adminId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.notification.count({
        where: { userId: session.adminId, readAt: null },
      }),
    ]);
    return NextResponse.json(toJson({ items, unread }));
  } catch (error) {
    return serverError(error);
  }
}

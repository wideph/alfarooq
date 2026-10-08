import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { createOfficeUser, hashOfficeUserPassword, validateOfficeUser } from "@/lib/office/office-users";
import { ROLE_LABELS } from "@/lib/office/permissions";

type RouteParams = { params: Promise<{ id: string }> };

// N2: mojooda booking office mein baad mein bhi naya user/role add ho sakta hai
// (same validation + member sync as office-creation time).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  const { id } = await params;

  try {
    const office = await prisma.bookingOffice.findUnique({ where: { id } });
    if (!office) return notFound("Booking office nahi mila");

    const validated = validateOfficeUser(await request.json());
    if ("error" in validated) return badRequest(validated.error);

    // bcrypt hashing transaction ke bahar — tx sirf DB work rakhe.
    const hashed = await hashOfficeUserPassword(validated.data);

    const admin = await prisma.$transaction(async (tx) => {
      return createOfficeUser(tx, session, id, hashed);
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json(
      {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        roleLabel: ROLE_LABELS[admin.role] || admin.role,
        bookingOfficeId: admin.bookingOfficeId,
        isActive: admin.isActive,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("pehle se registered")) {
      return badRequest(error.message);
    }
    return serverError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { cleanText, toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

// Department access links (§N9 — 06_NEW_REQUIREMENTS.md): label + URL per
// department, shown on login/setup pages. DNS is handled manually by the owner;
// this table only stores + displays the links.

// GET — any authenticated office user. Active links only by default;
// ?all=1 (office:setup:write) returns inactive rows too for the setup UI.
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const showAll = searchParams.get("all") === "1" && hasPermission(session, "office:setup:write");

  const links = await prisma.departmentLink.findMany({
    where: showAll ? {} : { isActive: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(toJson(links));
}

function readLinkBody(body: Record<string, unknown>) {
  const department = cleanText(body.department, 40);
  const label = cleanText(body.label, 120);
  const url = cleanText(body.url, 500);
  if (!department) return { error: "Department zaroori hai" };
  if (!label) return { error: "Label zaroori hai" };
  if (!url) return { error: "URL zaroori hai" };
  if (!/^https?:\/\//i.test(url)) return { error: "URL http/https se shuru hona chahiye" };
  const order = typeof body.order === "number" && Number.isFinite(body.order) ? body.order : 0;
  return { data: { department, label, url, order } };
}

// POST { department, label, url, order?, isActive? }
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const parsed = readLinkBody(body);
    if (parsed.error !== undefined) return badRequest(parsed.error);

    const link = await prisma.departmentLink.create({
      data: {
        ...parsed.data,
        isActive: body.isActive === undefined ? true : body.isActive !== false,
      },
    });
    await logOfficeAction(session, {
      action: "department_link.create",
      entity: "DepartmentLink",
      entityId: link.id,
      after: link,
    });
    return NextResponse.json(toJson(link), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

// PATCH { id, department?, label?, url?, order?, isActive? }
export async function PATCH(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const existing = await prisma.departmentLink.findUnique({ where: { id } });
    if (!existing) return notFound("Link nahi mila");

    const data: Record<string, unknown> = {};
    if (body.department !== undefined) {
      const department = cleanText(body.department, 40);
      if (!department) return badRequest("Department khaali nahi ho sakta");
      data.department = department;
    }
    if (body.label !== undefined) {
      const label = cleanText(body.label, 120);
      if (!label) return badRequest("Label khaali nahi ho sakta");
      data.label = label;
    }
    if (body.url !== undefined) {
      const url = cleanText(body.url, 500);
      if (!url || !/^https?:\/\//i.test(url)) return badRequest("URL http/https se shuru hona chahiye");
      data.url = url;
    }
    if (body.order !== undefined) {
      if (typeof body.order !== "number" || !Number.isFinite(body.order)) return badRequest("Order number hona chahiye");
      data.order = body.order;
    }
    if (body.isActive !== undefined) data.isActive = body.isActive !== false;

    const link = await prisma.departmentLink.update({ where: { id }, data });
    await logOfficeAction(session, {
      action: "department_link.update",
      entity: "DepartmentLink",
      entityId: id,
      before: existing,
      after: link,
    });
    return NextResponse.json(toJson(link));
  } catch (error) {
    return serverError(error);
  }
}

// DELETE ?id=
export async function DELETE(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") || "";
  const existing = await prisma.departmentLink.findUnique({ where: { id } });
  if (!existing) return notFound("Link nahi mila");
  await prisma.departmentLink.delete({ where: { id } });
  await logOfficeAction(session, {
    action: "department_link.delete",
    entity: "DepartmentLink",
    entityId: id,
    before: existing,
  });
  return NextResponse.json({ success: true });
}

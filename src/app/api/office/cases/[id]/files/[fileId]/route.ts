import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardOffice, notFound, serverError } from "@/lib/office/guard";
import { caseFileVisibility } from "@/lib/office/case-files";
import { getOfficeFileSignedUrl } from "@/lib/office/r2";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string; fileId: string }> };

// §W26 — GET (?download=1): ek department file ko kholne/download karne ka
// STABLE link. Har request par access check (files list wala same rule) aur
// phir taaza signed R2 URL par redirect — list ke purane signed URLs expire
// hone se file blank/"kharab" nahi dikhti. Redirect 10 min browser-cache hota
// hai (signed URL 1 ghanta valid) taake video seek par baar baar function na chale.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id, fileId } = await params;
  try {
    const where = await caseFileVisibility(session, id);
    if (!where) return notFound("Case nahi mila");
    const file = await prisma.caseFile.findFirst({
      where: { AND: [where, { id: fileId }] },
      select: { fileKey: true },
    });
    if (!file) return notFound("File nahi mili");

    const download = new URL(request.url).searchParams.get("download") === "1";
    const url = await getOfficeFileSignedUrl(file.fileKey, 3600, download ? { download: true } : {});
    const response = NextResponse.redirect(url, 302);
    response.headers.set("Cache-Control", "private, max-age=600");
    return response;
  } catch (error) {
    return serverError(error);
  }
}

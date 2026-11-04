import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { guardOffice, notFound, serverError } from "@/lib/office/guard";
import { deptPermissionsOf, findAccessibleCase, findDeptAccessibleCase } from "@/lib/office/case-access";
import { getOfficeFileSignedUrl } from "@/lib/office/r2";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// §W58 — client info ki tasveer ka STABLE link (GET, ?download=1 = download).
// Jo case dekh sakta hai (apna scope) wo, aur doosre office ka case ho to
// FILING department permission wala user (filing ko tasveer zaroori hai). Har
// request par access check, phir taaza signed R2 URL par redirect — list /
// detail ke purane signed URL 15 min baad expire ho kar tasveer gayab nahi hoti.
// Redirect 10 min browser-cache (signed URL 1 ghanta valid): queue ki live
// refresh par thumbnail baar baar download nahi hota.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item =
      (await findAccessibleCase(session, id)) ??
      (deptPermissionsOf(session).includes("FILING") ? await findDeptAccessibleCase(session, id) : null);
    if (!item) return notFound("Case nahi mila");
    if (!item.clientPictureKey) return notFound("Is case par client picture nahi");

    const download = new URL(request.url).searchParams.get("download") === "1";
    const ext = path.extname(item.clientPictureKey) || (item.clientPictureType === "pdf" ? ".pdf" : ".jpg");
    const url = await getOfficeFileSignedUrl(
      item.clientPictureKey,
      3600,
      download ? { download: `client-picture-${item.caseNumber}${ext}` } : {}
    );
    const response = NextResponse.redirect(url, 302);
    response.headers.set("Cache-Control", "private, max-age=600");
    return response;
  } catch (error) {
    return serverError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  getMimeType,
  getSignedUploadedFileUrl,
  readUploadedFile,
} from "@/lib/storage";
import { isMediaFileAllowed } from "@/lib/media-access";
type RouteParams = { params: Promise<{ filename: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { filename } = await params;

  try {
    const allowed = await isMediaFileAllowed(filename);
    if (!allowed) {
      return NextResponse.json({ error: "File nahi mili" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get("direct") === "1") {
      const signedUrl = await getSignedUploadedFileUrl(filename);
      return NextResponse.redirect(signedUrl, {
        status: 307,
        headers: {
          // The object URL is short-lived but the filename is already guarded.
          // Let the browser/CDN reuse this redirect instead of signing on every
          // logo, image and PDF request.
          // §W28: signed URL 60 min valid hai — redirect 45 min tak reuse
          // (CDN Age header browser freshness se minus hota hai, is liye
          // max-age + swr hamesha signed URL ki umar ke andar rehta hai).
          // Pehle 5 min baad har logo/image par dobara signing + DB check.
          "Cache-Control": "public, max-age=2700, s-maxage=2700, stale-while-revalidate=300",
        },
      });
    }

    const buffer = await readUploadedFile(filename);
    const mimeType = getMimeType(filename);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File load fail" }, { status: 404 });
  }
}

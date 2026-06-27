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
          "Cache-Control": "private, max-age=300",
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

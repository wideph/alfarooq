import { NextRequest, NextResponse } from "next/server";
import { readUploadedFile, getMimeType } from "@/lib/storage";
import { isMediaFileAllowed } from "@/lib/media-access";
type RouteParams = { params: Promise<{ filename: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { filename } = await params;

  try {
    const allowed = await isMediaFileAllowed(filename);
    if (!allowed) {
      return NextResponse.json({ error: "File nahi mili" }, { status: 404 });
    }

    const buffer = await readUploadedFile(filename);
    const mimeType = getMimeType(filename);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File load fail" }, { status: 404 });
  }
}

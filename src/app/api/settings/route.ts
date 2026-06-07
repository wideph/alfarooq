import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/storage";
import { fetchSiteSettingsFromDb } from "@/lib/get-site-settings";
import { SITE_SETTINGS_ID } from "@/lib/site-settings";

export async function GET() {
  const settings = await fetchSiteSettingsFromDb();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await fetchSiteSettingsFromDb();
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const siteName = (formData.get("siteName") as string)?.trim();
      const heroText = (formData.get("heroText") as string) ?? "";
      const whatsappNumber = (formData.get("whatsappNumber") as string) ?? "";
      const removeLogo = formData.get("removeLogo") === "true";
      const logoFile = formData.get("logo") as File | null;

      let logoFilename = existing.logoFilename;

      if (removeLogo && existing.logoFilename) {
        await deleteUploadedFile(existing.logoFilename);
        logoFilename = null;
      }

      if (logoFile && logoFile.size > 0) {
        if (existing.logoFilename) {
          await deleteUploadedFile(existing.logoFilename);
        }
        const saved = await saveUploadedFile(logoFile, "logo");
        if (saved.type !== "image") {
          return NextResponse.json(
            { error: "Logo sirf image ho sakti hai" },
            { status: 400 }
          );
        }
        logoFilename = saved.filename;
      }

      const settings = await prisma.siteSettings.update({
        where: { id: SITE_SETTINGS_ID },
        data: {
          ...(siteName && { siteName }),
          heroText,
          whatsappNumber,
          logoFilename,
        },
      });

      revalidateTag("site-settings");
      revalidatePath("/", "layout");
      revalidatePath("/");

      return NextResponse.json(settings);
    }

    const body = await request.json();
    const settings = await prisma.siteSettings.update({
      where: { id: SITE_SETTINGS_ID },
      data: {
        ...(body.siteName !== undefined && { siteName: body.siteName.trim() }),
        ...(body.heroText !== undefined && { heroText: body.heroText }),
        ...(body.whatsappNumber !== undefined && {
          whatsappNumber: body.whatsappNumber,
        }),
      },
    });

    revalidateTag("site-settings");
    revalidatePath("/", "layout");
    revalidatePath("/");

    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

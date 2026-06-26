import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/storage";
import { fetchSiteSettingsFromDb } from "@/lib/get-site-settings";
import { SITE_SETTINGS_ID } from "@/lib/site-settings";

export async function GET() {
  const settings = await fetchSiteSettingsFromDb();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  try {
    await requirePermission("settings:write");
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }

  try {
    const existing = await fetchSiteSettingsFromDb();
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const siteName = (formData.get("siteName") as string)?.trim();
      const heroText = (formData.get("heroText") as string) ?? "";
      const whatsappNumber = (formData.get("whatsappNumber") as string) ?? "";
      const metaPixelId = ((formData.get("metaPixelId") as string) ?? "").trim();
      const metaAccessToken = ((formData.get("metaAccessToken") as string) ?? "").trim();
      const clearMetaAccessToken = formData.get("clearMetaAccessToken") === "true";
      const googleAdsTagId = ((formData.get("googleAdsTagId") as string) ?? "").trim();
      const tiktokPixelId = ((formData.get("tiktokPixelId") as string) ?? "").trim();
      const botEnabled = formData.get("botEnabled") === "true";
      const botProvider = ((formData.get("botProvider") as string) ?? "openai").trim();
      const botModel = ((formData.get("botModel") as string) ?? "").trim();
      const botApiKey = ((formData.get("botApiKey") as string) ?? "").trim();
      const clearBotApiKey = formData.get("clearBotApiKey") === "true";
      const botSystemNote = ((formData.get("botSystemNote") as string) ?? "").trim();
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

      await prisma.siteSettings.update({
        where: { id: SITE_SETTINGS_ID },
        data: {
          ...(siteName && { siteName }),
          heroText,
          whatsappNumber,
          metaPixelId,
          ...(clearMetaAccessToken
            ? { metaAccessToken: "" }
            : metaAccessToken
              ? { metaAccessToken }
              : {}),
          googleAdsTagId,
          tiktokPixelId,
          botEnabled,
          botProvider,
          botModel,
          ...(clearBotApiKey ? { botApiKey: "" } : botApiKey ? { botApiKey } : {}),
          botSystemNote,
          logoFilename,
        },
      });

      revalidateTag("site-settings");
      revalidateTag("media-access");
      revalidatePath("/", "layout");
      revalidatePath("/");

      return NextResponse.json(await fetchSiteSettingsFromDb());
    }

    const body = await request.json();
    await prisma.siteSettings.update({
      where: { id: SITE_SETTINGS_ID },
      data: {
        ...(body.siteName !== undefined && { siteName: body.siteName.trim() }),
        ...(body.heroText !== undefined && { heroText: body.heroText }),
        ...(body.whatsappNumber !== undefined && {
          whatsappNumber: body.whatsappNumber,
        }),
        ...(body.metaPixelId !== undefined && { metaPixelId: body.metaPixelId.trim() }),
        ...(body.googleAdsTagId !== undefined && { googleAdsTagId: body.googleAdsTagId.trim() }),
        ...(body.tiktokPixelId !== undefined && { tiktokPixelId: body.tiktokPixelId.trim() }),
        ...(body.botEnabled !== undefined && { botEnabled: Boolean(body.botEnabled) }),
        ...(body.botProvider !== undefined && { botProvider: body.botProvider }),
        ...(body.botModel !== undefined && { botModel: body.botModel.trim() }),
        ...(body.botSystemNote !== undefined && { botSystemNote: body.botSystemNote }),
        ...(body.clearMetaAccessToken
          ? { metaAccessToken: "" }
          : body.metaAccessToken
            ? { metaAccessToken: body.metaAccessToken.trim() }
            : {}),
        ...(body.clearBotApiKey
          ? { botApiKey: "" }
          : body.botApiKey
            ? { botApiKey: body.botApiKey.trim() }
            : {}),
      },
    });

    revalidateTag("site-settings");
    revalidatePath("/", "layout");
    revalidatePath("/");

    return NextResponse.json(await fetchSiteSettingsFromDb());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

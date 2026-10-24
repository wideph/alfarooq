import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { findAccessibleCase } from "@/lib/office/case-access";
import { MAX_FILES_PER_UPLOAD, caseFilePrefix } from "@/lib/office/case-files";
import {
  ensureOfficeBucketCors,
  getOfficeUploadSignedUrl,
  planDepartmentUpload,
} from "@/lib/office/r2";
import { CASE_DEPARTMENTS, DEPARTMENT_PERMISSIONS, type CaseDepartment } from "@/lib/office/workflow";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

type Body = {
  department?: unknown;
  files?: Array<{ name?: unknown; type?: unknown; size?: unknown }>;
};

// Sirf apni hi site ka origin bucket CORS mein add ho (koi bahar ka origin nahi).
function sameSiteOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) return null;
  try {
    return new URL(origin).host === host.split(",")[0].trim() ? origin : null;
  } catch {
    return null;
  }
}

// §W26 — POST { department, files: [{ name, type, size }] } → har file ke liye
// short-lived signed PUT URL. Browser file ko SEEDHA R2 par bhejta hai (Vercel
// function ki 4.5 MB request limit se bahar — video, badi PDF, kai images),
// phir POST /files (JSON) se register karta hai. Yahan sirf permission + type +
// size check hota hai; DB mein kuch nahi likha jata.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body || typeof body !== "object") return badRequest("Request sahi nahi hai");

    const department = String(body.department || "").toUpperCase() as CaseDepartment;
    if (!(CASE_DEPARTMENTS as readonly string[]).includes(department)) {
      return badRequest("Department sahi nahi hai (FILING | PRINTING | ATTESTATION | COURIER)");
    }
    if (!hasPermission(session, DEPARTMENT_PERMISSIONS[department])) {
      return forbidden("Is department ke files upload karne ki permission nahi hai");
    }

    // Same access rule as POST /files (§W18 dept cross-office path).
    const item =
      (await findAccessibleCase(session, id)) ??
      (await prisma.case.findFirst({ where: { id } }));
    if (!item) return notFound("Case nahi mila");
    if (item.status === "CANCELLED") return badRequest("Cancelled case par file upload nahi ho sakti");

    const list = Array.isArray(body.files) ? body.files : [];
    if (list.length === 0) return badRequest("Koi file select nahi ki");
    if (list.length > MAX_FILES_PER_UPLOAD) {
      return badRequest(`Ek dafa mein zyada se zyada ${MAX_FILES_PER_UPLOAD} files`);
    }

    const prefix = caseFilePrefix(item.caseNumber, department);
    let plans: ReturnType<typeof planDepartmentUpload>[];
    try {
      plans = list.map((file) =>
        planDepartmentUpload(
          {
            name: String(file?.name || "file").slice(0, 200),
            type: typeof file?.type === "string" ? file.type : "",
            size: Number(file?.size),
          },
          prefix
        )
      );
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "File sahi nahi hai");
    }

    const origin = sameSiteOrigin(request);
    const corsReady = origin ? await ensureOfficeBucketCors(origin) : false;

    const uploads = await Promise.all(
      plans.map(async (plan, index) => ({
        index,
        key: plan.key,
        fileType: plan.fileType,
        contentType: plan.contentType,
        uploadUrl: await getOfficeUploadSignedUrl(plan.key, plan.contentType),
      }))
    );
    return NextResponse.json({ uploads, corsReady });
  } catch (error) {
    return serverError(error);
  }
}

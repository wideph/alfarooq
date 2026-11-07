import { NextRequest, NextResponse, after } from "next/server";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { recomputeCaseFinancials } from "@/lib/office/commission";
import { parseAmount, toNumber } from "@/lib/office/money";
import { notifyAdmins, notifyPermission, notifyRole } from "@/lib/office/notifications";
import { uploadOfficeFile, deleteOfficeFile } from "@/lib/office/r2";
import { cleanText } from "@/lib/office/serializers";
import { planCaseDates, researchCaseDates } from "@/lib/office/date-recheck";
import { advanceCourierStage } from "@/lib/office/workflow";
import { bookCaseService, ServiceInputError, updateCaseService } from "@/lib/office/case-services";

export const preferredRegion = ["sin1"];

// §W60: after() mein AI date research (90s tak).
export const maxDuration = 300;

type RouteParams = { params: Promise<{ id: string }> };

function flag(value: unknown) {
  return value === true || value === "true" || value === "1" || value === "on";
}

// §W56 — POST: extra service book (booking office apne case par; admin /
// cashier bhi). JSON ya multipart (reissue ki nayi tasveer `image`):
//   { name?, amount, reissue?, remarks?, attestationTypeIds?: string[] | JSON,
//     musadiqa?, customName? }
// Amount case ke agreed mein judti hai; kaam ke hisson ka asar case-services.ts.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  const { id } = await params;
  let uploadedKey: string | null = null;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");

    const isMultipart = (request.headers.get("content-type") || "").includes("multipart/form-data");
    let fields: Record<string, unknown> = {};
    let image: File | null = null;
    if (isMultipart) {
      const form = await request.formData();
      for (const [key, value] of form.entries()) {
        if (key === "image") {
          if (value instanceof File && value.size > 0) image = value;
        } else fields[key] = value;
      }
    } else {
      fields = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    }

    const amount = parseAmount(fields.amount);
    if (amount === null) return badRequest("Extra service ki amount likhein (0 ya zyada)");
    let attestationTypeIds: string[] = [];
    const rawIds = fields.attestationTypeIds;
    if (Array.isArray(rawIds)) attestationTypeIds = rawIds.filter((value): value is string => typeof value === "string");
    else if (typeof rawIds === "string" && rawIds.trim()) {
      try {
        const parsed = JSON.parse(rawIds);
        if (Array.isArray(parsed)) attestationTypeIds = parsed.filter((value): value is string => typeof value === "string");
      } catch {
        return badRequest("Attestations ki list sahi nahi hai");
      }
    }
    const reissue = flag(fields.reissue);
    if (image && !reissue) return badRequest("Nayi tasveer sirf reissue ke saath");
    if (image) {
      // §W57 — ghalat qisam / badi file ka saaf paigham (500 nahi).
      try {
        const uploaded = await uploadOfficeFile(image, `services/${item.caseNumber}`);
        uploadedKey = uploaded.key;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/allowed|MB/.test(message)) return badRequest(message);
        throw error;
      }
    }

    const result = await bookCaseService(session, id, {
      name: cleanText(fields.name, 200),
      amount,
      reissue,
      remarks: cleanText(fields.remarks, 1000),
      attestationTypeIds: [...new Set(attestationTypeIds)],
      musadiqa: flag(fields.musadiqa),
      customName: cleanText(fields.customName, 120),
      image: uploadedKey ? { key: uploadedKey, type: image?.type.includes("pdf") ? "pdf" : "image" } : null,
    });
    uploadedKey = null;

    // Paisa (agreed barha) → commission / extra / status pehle jaisa recompute.
    await recomputeCaseFinancials(id, session);
    const courierStage = await advanceCourierStage(id);

    // §W60: service ki attestations ki dates FORAN — kal se, har ek apne mulk /
    // din ke qaide aur tarteeb (Board → ibcc → Mofa → Saudi Embassy → Mofa
    // Saudi) se (pehle sab ko ek hi din, after() mein AI ke intezar ke saath).
    if (result.attestationIds.length > 0) {
      await planCaseDates(id, { replanIds: result.attestationIds }, session);
    }

    after(async () => {
      if (result.attestationIds.length > 0) await researchCaseDates(id);
      await logOfficeAction(session, {
        action: "case.service.book",
        entity: "Case",
        entityId: id,
        after: {
          serviceId: result.service.id,
          name: result.service.name,
          amount,
          reissue,
          attestations: result.attestationNames,
          musadiqa: result.service.musadiqa,
          customName: result.service.customName,
          status: { from: result.fromStatus, to: courierStage ?? result.toStatus },
          commissionDobara: result.recredit,
        },
      });
      const link = `/office/cases/${id}`;
      const title = `Case ${result.caseNumber}: extra service "${result.service.name}" (Rs ${toNumber(amount).toLocaleString("en-PK")})`;
      await notifyAdmins({ type: "case.service", title, link });
      // §W59: department ko saaf — kya karna hai (tafseel case ke Remarks mein).
      if (reissue) {
        await notifyRole("filing", {
          type: "case.service",
          title: `Case ${result.caseNumber}: document dobara banana hai — hidayat case ke Remarks mein`,
          link,
        });
      }
      if (result.attestationIds.length > 0) {
        await notifyPermission("office:attestation-dept:write", {
          type: "case.service",
          title: `Case ${result.caseNumber}: extra service — attestation ${result.attestationNames.join(", ")}${reissue ? " (dobara print ke baad)" : ""}`,
          link,
        });
      }
    });

    return NextResponse.json(await loadCaseDetail(session, id), { status: 201 });
  } catch (error) {
    if (uploadedKey) await deleteOfficeFile(uploadedKey).catch(() => undefined);
    if (error instanceof ServiceInputError) return badRequest(error.message);
    return serverError(error);
  }
}

// §W56 — PATCH { serviceId, action: "musadiqa-attested" | "custom-done" | "cancel" }
// (sirf super admin). Cancel: amount agreed se wapas; kiya hua kaam waisa hi.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (session.role !== "admin") return forbidden("Extra service ka status sirf admin badal sakta hai");
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    const body = await request.json().catch(() => ({}));
    const serviceId = typeof body.serviceId === "string" ? body.serviceId : "";
    const action = body.action;
    if (action !== "musadiqa-attested" && action !== "custom-done" && action !== "cancel") {
      return badRequest("Action sahi nahi hai");
    }
    const updated = await updateCaseService(id, serviceId, action);
    if (action === "cancel") {
      await recomputeCaseFinancials(id, session);
      await advanceCourierStage(id);
    }
    after(async () => {
      await logOfficeAction(session, {
        action: `case.service.${action}`,
        entity: "Case",
        entityId: id,
        after: { serviceId, name: updated.name, amount: updated.amount },
      });
    });
    return NextResponse.json(await loadCaseDetail(session, id));
  } catch (error) {
    if (error instanceof ServiceInputError) return badRequest(error.message);
    return serverError(error);
  }
}

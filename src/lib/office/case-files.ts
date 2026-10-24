import type { Prisma } from "@prisma/client";
import type { AdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deptPermissionsOf, findAccessibleCase } from "@/lib/office/case-access";
import type { DepartmentFileType } from "@/lib/office/r2";
import {
  VERIFICATION_STICKER_STEP_KEY,
  autoBridgePrintingForDualDept,
  evaluateCaseCompletion,
  type CaseDepartment,
} from "@/lib/office/workflow";

// §W26 — department files (printing proof, attestation step/FINAL files,
// filing files, courier slip) ka shared server logic: kaun si files kaun dekh
// sakta hai, aur ek ya kai files ek hi transaction mein register karna.

// Ek upload mein zyada se zyada itni files (multi-proof).
export const MAX_FILES_PER_UPLOAD = 20;

// R2 key prefix jahan is case + department ki files jati hain. Direct upload
// registration sirf isi prefix ke keys qubool karti hai.
export function caseFilePrefix(caseNumber: string, department: CaseDepartment) {
  return `cases/${caseNumber}/${department.toLowerCase()}`;
}

// Files list / single-file open ka visibility rule (GET files route ka purana
// logic — §W11.6, §W18, §W24 — yahan move hua taake dono routes same hon).
// null = case nahi mila / access nahi.
export async function caseFileVisibility(
  session: AdminSession,
  caseId: string
): Promise<Prisma.CaseFileWhereInput | null> {
  const item = await findAccessibleCase(session, caseId);
  // §W18: caseScope block kare to department workers (kisi dept ki write
  // permission) cross-office files dekh sakte hain — magar SIRF apne
  // departments ki files.
  const deptOnly = item ? [] : deptPermissionsOf(session);
  if (!item) {
    if (deptOnly.length === 0) return null;
    const exists = await prisma.case.findFirst({ where: { id: caseId }, select: { id: true } });
    if (!exists) return null;
  }
  // §W24: printing / attestation dept workers ko FILING files bhi milti hain
  // (READ-ONLY view — unhe source documents print/attest karne ke liye chahiye).
  const visibleDepts: string[] = [...deptOnly];
  if (
    visibleDepts.length > 0 &&
    !visibleDepts.includes("FILING") &&
    (visibleDepts.includes("PRINTING") || visibleDepts.includes("ATTESTATION"))
  ) {
    visibleDepts.push("FILING");
  }

  // §W11.6: booking office users ko FILING department ki files sirf tab
  // dikhen jab admin ne is case par permission di ho.
  const hideFilingFiles =
    item !== null && session.role === "booking_office" && !item.filingFilesVisibleToBooking;

  if (visibleDepts.length > 0) return { caseId, department: { in: visibleDepts } };
  if (hideFilingFiles) return { caseId, department: { not: "FILING" } };
  return { caseId };
}

// title: undefined → shared title se numbering; string/null → bilkul yahi.
export type NewCaseFile = { key: string; type: DepartmentFileType; title?: string | null };

// Multi-file title: ek file → title jaisa hai; kai files → "title (1/3)".
export function titleFor(title: string | null, index: number, total: number) {
  if (!title) return null;
  if (total <= 1) return title;
  return `${title} (${index + 1}/${total})`.slice(0, 200);
}

// Ek ya kai uploaded files ke rows + department workflow transition (§W11.1)
// EK transaction mein. Transition sirf ek dafa evaluate hota hai, chahe kitni
// bhi files hon:
//   first FILING file   → WAITING_FOR_FILE → WAITING_FOR_PRINTING
//   first PRINTING file → WAITING_FOR_PRINTING → PRINTED (+ isPrinted)
//   ATTESTATION files   → FINAL + tamam steps DONE → ATTESTATION_COMPLETE
//   COURIER slip        → WAITING_FOR_COURIER → DELIVERED
export async function registerCaseFiles(params: {
  session: AdminSession;
  item: { id: string; status: string };
  department: CaseDepartment;
  stepKey: string | null;
  title: string | null;
  files: NewCaseFile[];
}) {
  const { session, item, department, stepKey, title, files } = params;
  const caseId = item.id;

  return prisma.$transaction(
    async (tx) => {
      const created = [];
      for (const [index, file] of files.entries()) {
        created.push(
          await tx.caseFile.create({
            data: {
              caseId,
              department,
              stepKey,
              fileKey: file.key,
              fileType: file.type,
              title: file.title !== undefined ? file.title : titleFor(title, index, files.length),
              uploadedById: session.adminId,
            },
          })
        );
      }
      const createdIds = created.map((row) => row.id);

      let nextStatus = item.status;
      const caseData: { status?: string; isPrinted?: boolean; printedAt?: Date } = {};
      // W21: verification stickers (FILING + stepKey VERIFICATION_STICKER) are
      // allowed ANYTIME — they never trigger the filing→printing transition
      // and never count as the "first filing file".
      const isSticker = department === "FILING" && stepKey === VERIFICATION_STICKER_STEP_KEY;

      if (department === "FILING" && !isSticker && item.status === "WAITING_FOR_FILE") {
        const earlier = await tx.caseFile.count({
          where: {
            caseId,
            department: "FILING",
            id: { notIn: createdIds },
            // Stickers uploaded earlier must not mark filing as done.
            OR: [{ stepKey: null }, { stepKey: { not: VERIFICATION_STICKER_STEP_KEY } }],
          },
        });
        if (earlier === 0) {
          caseData.status = "WAITING_FOR_PRINTING";
          nextStatus = "WAITING_FOR_PRINTING";
        }
      } else if (department === "PRINTING" && item.status === "WAITING_FOR_PRINTING") {
        const earlier = await tx.caseFile.count({
          where: { caseId, department: "PRINTING", id: { notIn: createdIds } },
        });
        if (earlier === 0) {
          caseData.status = "PRINTED";
          caseData.isPrinted = true;
          caseData.printedAt = new Date();
          nextStatus = "PRINTED";
        }
      } else if (department === "COURIER") {
        // §W11.1: courier slip sirf tab DELIVERED karta hai jab case courier
        // stage par ho (payment complete ho chuki ho).
        if (item.status === "WAITING_FOR_COURIER") {
          caseData.status = "DELIVERED";
          nextStatus = "DELIVERED";
        }
      }

      if (Object.keys(caseData).length > 0) {
        await tx.case.update({ where: { id: caseId }, data: caseData });
      }

      // ATTESTATION uploads (step files or the mandatory FINAL file) may
      // complete the attestation stage (→ ATTESTATION_COMPLETE).
      // §F22.5: dual-perm actor (printing + attestation-dept) bridged the case
      // WAITING_FOR_PRINTING → PRINTED inside this tx BEFORE the completion
      // check, so the printing step (and its commission) is not skipped.
      let completed = false;
      let bridged = false;
      if (department === "ATTESTATION") {
        bridged = await autoBridgePrintingForDualDept(caseId, session, tx);
        completed = await evaluateCaseCompletion(caseId, tx);
        if (completed) nextStatus = "ATTESTATION_COMPLETE";
        else if (bridged) nextStatus = "PRINTED";
      }

      return { created, nextStatus, completed, bridged };
    },
    { maxWait: 10000, timeout: 30000 }
  );
}

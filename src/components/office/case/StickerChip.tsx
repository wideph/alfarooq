// §W21: verification sticker files (stepKey VERIFICATION_STICKER ya title match)
// har files list mein ek chhote "Sticker" chip se pehchani jati hain —
// CaseFilesTab / DeptCaseView / filing views sab yahi use karte hain.

export function isVerificationSticker(file: { stepKey?: string | null; title?: string | null }): boolean {
  if (file.stepKey === "VERIFICATION_STICKER") return true;
  return (file.title || "").toLowerCase().includes("verification sticker");
}

export default function StickerChip() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
      Sticker
    </span>
  );
}

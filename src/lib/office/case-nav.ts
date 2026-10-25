// §W34 — case detail page kis tab / list se khula ("from" query). Is se:
//   - navbar mein wahi tab active rehta hai (Printing / Attestation ... na ke
//     Cases),
//   - back button aur delete ke baad wapsi wahin hoti hai,
//   - department tab se khula ho aur user ke action se us department ka kaam
//     mukammal ho jaye to page khud wapas us tab par le jata hai.
// Sirf /office ke andar ke relative paths qabool (open redirect nahi).

export const CASES_HREF = "/office/cases";

const ORIGIN_BASE = "http://office.local";

export function safeOfficeFrom(value: string | null | undefined): string | null {
  if (!value || !/^\/office(?:[/?]|$)/.test(value) || /[\\\s]/.test(value)) return null;
  // Detail page khud origin nahi ho sakta (wapsi ka loop).
  if (/^\/office\/cases\/(?!new(?:[/?]|$))[^/?]+/.test(value)) return null;
  return value;
}

// Current list ki jagah (path + query) — detail link ke "from" ke liye.
export function locationOf(pathname: string, searchParams?: { toString(): string } | null): string {
  const query = searchParams?.toString() || "";
  return query ? `${pathname}?${query}` : pathname;
}

export function caseDetailHref(id: string, from?: string | null): string {
  const safe = safeOfficeFrom(from);
  // Saada Cases list default wapsi hai — URL saaf rakho.
  return safe && safe !== CASES_HREF
    ? `${CASES_HREF}/${id}?from=${encodeURIComponent(safe)}`
    : `${CASES_HREF}/${id}`;
}

// Navbar ke liye "asal" jagah: detail page par origin tab, warna khud page.
export function officeNavLocation(
  pathname: string,
  searchParams: { get(name: string): string | null; toString(): string }
): { path: string; params: URLSearchParams } {
  if (pathname.startsWith(`${CASES_HREF}/`)) {
    const from = safeOfficeFrom(searchParams.get("from"));
    if (from) {
      const url = new URL(from, ORIGIN_BASE);
      return { path: url.pathname, params: url.searchParams };
    }
  }
  return { path: pathname, params: new URLSearchParams(searchParams.toString()) };
}

export type CaseOriginDept = "filing" | "printing" | "attestation" | "courier";

const ORIGIN_DEPTS: CaseOriginDept[] = ["filing", "printing", "attestation", "courier"];

function isOriginDept(value: string): value is CaseOriginDept {
  return (ORIGIN_DEPTS as string[]).includes(value);
}

const DEPT_LABELS: Record<CaseOriginDept, string> = {
  filing: "Filing",
  printing: "Printing",
  attestation: "Attestation",
  courier: "Courier",
};

// Department queue ke "kaam baqi" statuses (workflow.ts deptQueueWhere ke
// mutabiq). Case in se bahar nikle = us department ka kaam mukammal.
const DEPT_PENDING_STATUSES: Record<CaseOriginDept, string[]> = {
  filing: ["WAITING_FOR_FILE"],
  printing: ["WAITING_FOR_PRINTING"],
  attestation: ["PRINTED", "ATTESTATION"],
  courier: ["WAITING_FOR_COURIER"],
};

// Origin ek department ki (history nahi) queue ho to us ka key.
export function originDept(from: string | null): CaseOriginDept | null {
  if (!from) return null;
  const url = new URL(from, ORIGIN_BASE);
  if (url.pathname !== CASES_HREF || url.searchParams.get("history") === "1") return null;
  const dept = url.searchParams.get("dept") || "";
  return isOriginDept(dept) ? dept : null;
}

export function deptWorkFinished(dept: CaseOriginDept, previousStatus: string, nextStatus: string): boolean {
  const pending = DEPT_PENDING_STATUSES[dept];
  return previousStatus !== nextStatus && pending.includes(previousStatus) && !pending.includes(nextStatus);
}

// Back button / wapsi banner ka label.
export function originLabel(from: string | null): string {
  if (!from) return "Cases";
  const url = new URL(from, ORIGIN_BASE);
  if (url.pathname === CASES_HREF) {
    const dept = url.searchParams.get("dept") || "";
    if (isOriginDept(dept)) return `${DEPT_LABELS[dept]} queue`;
    return "Cases";
  }
  if (url.pathname.startsWith("/office/remarks")) return "Remarks";
  if (url.pathname.startsWith("/office/payments")) return "Payments";
  if (url.pathname.startsWith("/office/finance")) return "Finance";
  if (url.pathname === "/office") return "Offices";
  return "pichhle page";
}

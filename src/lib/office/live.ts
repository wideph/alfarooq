// §W11.5 — cross-page live refresh signal. officeFetch har successful
// mutation ke baad announceOfficeChange() call karta hai; useLiveRefresh
// hook is event ko sun kar (300ms debounce) refresh karta hai. Is file mein
// React import nahi hai taake client.ts jaise plain modules bhi use kar saken.

export const OFFICE_CHANGED_EVENT = "office:changed";

export function announceOfficeChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OFFICE_CHANGED_EVENT));
}

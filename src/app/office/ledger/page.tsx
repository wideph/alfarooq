import { redirect } from "next/navigation";

// §W12.3 — Ledger aur Finance merge ho gaye. Ye route sirf purane links ke
// liye hai. §W28 perf: server-side redirect (pehle client page load hota,
// JS chalti, phir redirect — ek poora extra page load).
export default function OfficeLedgerRedirect() {
  redirect("/office/finance");
}

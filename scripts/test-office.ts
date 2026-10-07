/**
 * Office module smoke test. Needs a running dev server, a super admin
 * (ADMIN_EMAIL / ADMIN_PASSWORD from .env) and a migrated DB.
 * Run: npx tsx scripts/test-office.ts   (TEST_URL overrides http://localhost:3000)
 *
 * Flow: login → setup office/category/attestation → create case → submit
 * payment → verify RECEIVED → check ledger half commission → final payment →
 * check full commission + expected printing date → finance report → cleanup.
 */
import { readFileSync } from "fs";
import { join } from "path";

try {
  const content = readFileSync(join(process.cwd(), ".env"), "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env optional
}

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

let cookie = "";
let failed = 0;

async function api<T = Record<string, unknown>>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ status: number; data: T }> {
  const { json, ...rest } = init;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      Cookie: cookie,
      ...(rest.headers || {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  console.log(`\n🧪 Office module smoke test against ${BASE_URL}\n`);
  const tag = Date.now();
  let officeId = "";
  let categoryId = "";
  let attestationTypeId = "";
  let caseId = "";
  let paymentId = "";

  await step("login as super admin", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    expect(res.ok, `status ${res.status}`);
    cookie = res.headers.get("set-cookie")?.split(";")[0] || "";
    expect(cookie, "no cookie");
  });

  await step("create fixed-commission booking office", async () => {
    const { status, data } = await api<{ id: string }>("/api/office/setup/booking-offices", {
      method: "POST",
      json: { name: `Test Office ${tag}`, type: "FIXED_COMMISSION" },
    });
    expect(status === 201, `status ${status} ${JSON.stringify(data)}`);
    officeId = data.id;
  });

  await step("create category + attestation type", async () => {
    const c = await api<{ id: string }>("/api/office/setup/categories", { method: "POST", json: { name: `Cat ${tag}`, defaultAmount: "10000" } });
    expect(c.status === 201, JSON.stringify(c.data));
    categoryId = c.data.id;
    const a = await api<{ id: string }>("/api/office/setup/attestation-types", { method: "POST", json: { name: `Att ${tag}` } });
    expect(a.status === 201, JSON.stringify(a.data));
    attestationTypeId = a.data.id;
  });

  await step("set commission 2000 for category", async () => {
    const { status, data } = await api(`/api/office/setup/booking-offices/${officeId}/commissions`, {
      method: "PUT",
      json: { items: [{ categoryId, amount: "2000" }] },
    });
    expect(status === 200, JSON.stringify(data));
  });

  await step("create case (agreed 10000)", async () => {
    const { status, data } = await api<{ id: string; caseNumber: string; commissionAmount: number }>("/api/office/cases", {
      method: "POST",
      json: {
        bookingOfficeId: officeId,
        clientName: "Test Client",
        categoryId,
        agreedAmount: "10000",
        attestationTypeIds: [attestationTypeId],
        contacts: [{ phone: "03001234567" }],
      },
    });
    expect(status === 201, JSON.stringify(data));
    expect(/^AF-\d{4}-\d{6}$/.test(data.caseNumber), `bad case number ${data.caseNumber}`);
    expect(data.commissionAmount === 2000, `commission snapshot ${data.commissionAmount}`);
    caseId = data.id;
  });

  await step("submit first payment 4000 (pending)", async () => {
    const fd = new FormData();
    fd.append("caseId", caseId);
    fd.append("amount", "4000");
    fd.append("paymentDate", "2026-10-01");
    fd.append("method", "CASH");
    const res = await fetch(`${BASE_URL}/api/office/payments`, { method: "POST", headers: { Cookie: cookie }, body: fd });
    const data = (await res.json()) as { payment: { id: string; status: string }; status: string };
    expect(res.status === 201, JSON.stringify(data));
    expect(data.payment.status === "PENDING", "should be pending");
    expect(data.status === "PAYMENT_PENDING", `case status ${data.status}`);
    paymentId = data.payment.id;
  });

  await step("verify payment RECEIVED → half commission + printing date", async () => {
    const { status, data } = await api<{ status: string; received: number }>(`/api/office/payments/${paymentId}`, {
      method: "PATCH",
      json: { status: "RECEIVED" },
    });
    expect(status === 200, JSON.stringify(data));
    expect(data.status === "IN_PROCESS", `case status ${data.status}`);
    const detail = await api<{ ledger: Array<{ type: string; amount: number }>; expectedPrintingDate: string | null }>(`/api/office/cases/${caseId}`);
    const half = detail.data.ledger.find((l) => l.type === "COMMISSION_HALF");
    expect(half && half.amount === 1000, `half commission ${JSON.stringify(detail.data.ledger)}`);
    expect(detail.data.expectedPrintingDate, "expected printing date missing");
    const expected = new Date(detail.data.expectedPrintingDate as string);
    expect(expected >= new Date("2026-10-07"), `printing date too early ${detail.data.expectedPrintingDate}`);
  });

  await step("final payment 7000 received → full commission, extra decision", async () => {
    const fd = new FormData();
    fd.append("caseId", caseId);
    fd.append("amount", "7000");
    fd.append("paymentDate", "2026-10-03");
    fd.append("status", "RECEIVED");
    const res = await fetch(`${BASE_URL}/api/office/payments`, { method: "POST", headers: { Cookie: cookie }, body: fd });
    const data = (await res.json()) as { needsExtraDecision: number | null; extra: number };
    expect(res.status === 201, JSON.stringify(data));
    expect(data.extra === 1000, `extra ${data.extra}`);
    expect(data.needsExtraDecision === 1000, "extra decision expected");
    const detail = await api<{ ledger: Array<{ type: string; amount: number; direction: string }> }>(`/api/office/cases/${caseId}`);
    const credited = detail.data.ledger
      .filter((l) => l.type.startsWith("COMMISSION"))
      .reduce((acc, l) => acc + (l.direction === "CREDIT" ? l.amount : -l.amount), 0);
    expect(credited === 2000, `credited commission ${credited}`);
  });

  await step("decide extra share 50% → EXTRA_SHARE 500", async () => {
    const { status, data } = await api<{ ledger: Array<{ type: string; amount: number }> }>(`/api/office/cases/${caseId}/commission`, {
      method: "PATCH",
      json: { extraSharePercent: 50 },
    });
    expect(status === 200, JSON.stringify(data));
    const extra = data.ledger.find((l) => l.type === "EXTRA_SHARE");
    expect(extra && extra.amount === 500, `extra share ${JSON.stringify(extra)}`);
  });

  await step("ledger balance = 2500", async () => {
    const { data } = await api<{ officeBalances: Record<string, number> }>(`/api/office/ledger?officeId=${officeId}`);
    expect(data.officeBalances[officeId] === 2500, `balance ${data.officeBalances[officeId]}`);
  });

  await step("finance report includes income 11000", async () => {
    const { status, data } = await api<{ summary: { income: number; commissions: number } }>("/api/office/finance?from=2026-10-01&to=2026-10-31");
    expect(status === 200, JSON.stringify(data));
    expect(data.summary.income >= 11000, `income ${data.summary.income}`);
    expect(data.summary.commissions >= 2500, `commissions ${data.summary.commissions}`);
  });

  await step("attestation done → case COMPLETED", async () => {
    const detail = await api<{ attestations: Array<{ id: string }> }>(`/api/office/cases/${caseId}`);
    const { status, data } = await api<{ status: string }>(`/api/office/cases/${caseId}/attestations`, {
      method: "PATCH",
      json: { id: detail.data.attestations[0].id, status: "DONE" },
    });
    expect(status === 200, JSON.stringify(data));
    expect(data.status === "COMPLETED", `case status ${data.status}`);
  });

  console.log("\n🧹 Cleanup (case with ledger cannot be deleted; office set inactive)");
  await api(`/api/office/cases/${caseId}/status`, { method: "PATCH", json: { status: "CANCELLED" } });
  await api("/api/office/setup/booking-offices", { method: "PUT", json: { id: officeId, name: `Test Office ${tag}`, type: "FIXED_COMMISSION", isActive: false } });

  console.log(`\n${failed === 0 ? "🎉 All office steps passed" : `❌ ${failed} step(s) failed`}\n`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error("Runner error:", error);
  process.exit(1);
});

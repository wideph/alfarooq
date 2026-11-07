/**
 * §W60 — attestation dates ki READ-ONLY jaanch (kuch likhta nahi).
 * Batata hai: kaun si pending dates chhutti / band din par hain, kahan tarteeb
 * (Board → UV / QR ibcc → Special Mofa → Saudi Embassy → Mofa Saudi) tooti hai,
 * kahan date khali hai, aur "Sab dates check karein" chalane par kya badlega.
 * Saath mein purani zehreeli cache (FALLBACK) ki ginti.
 *
 * Run:  npx tsx scripts/office-dates-audit.ts
 * (.env ka DATABASE_URL; theek karne ke liye admin Setup → Holidays →
 *  "Sab dates check karein".)
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { DayResolver } from "../src/lib/office/day-rules";
import { attestationDateProblems, computeAttestationPlan, formatDmy } from "../src/lib/office/attestation-dates";
import { builtinHolidayReason } from "../src/lib/office/holiday-calendar";

// --date YYYY-MM-DD: us din ki har cheez (attestations har status, expected
// printing dates, holiday / cache rows) — kisi khaas din ki tahqeeq ke liye.
async function inspectDate(text: string) {
  const date = new Date(`${text}T00:00:00Z`);
  const next = new Date(date.getTime() + 86_400_000);
  console.log(`\n=== ${text} — built-in: ${builtinHolidayReason(date, "PK") ?? "khula"} (PK), ${builtinHolidayReason(date, "SA") ?? "khula"} (SA)`);
  const holidays = await prisma.holidayClosure.findMany({ where: { date: { gte: date, lt: next } } });
  console.log(
    `HolidayClosure: ${holidays.map((row) => `${row.scope} "${row.reason}" [${row.date.toISOString()}]`).join(", ") || "koi row nahi"}`
  );
  const cache = await prisma.workingDayCache.findMany({ where: { candidateDate: { gte: date, lt: next } } });
  for (const row of cache) {
    console.log(`WorkingDayCache: ${row.source} working=${row.isCandidateWorking} → ${formatDmy(row.workingDate)} (bana ${row.createdAt.toISOString()})`);
  }
  const attestations = await prisma.caseAttestation.findMany({
    where: { OR: [{ scheduledDate: { gte: date, lt: next } }, { completedDate: { gte: date, lt: next } }] },
    include: { attestationType: { select: { name: true } }, case: { select: { caseNumber: true, status: true, setId: true } } },
  });
  for (const row of attestations) {
    console.log(
      `Attestation: ${row.case.caseNumber} (${row.case.status}${row.case.setId ? ", set" : ", bina set"}) ${row.attestationType.name} ` +
        `status=${row.status} scheduled=${row.scheduledDate ? formatDmy(row.scheduledDate) : "-"} completed=${row.completedDate ? formatDmy(row.completedDate) : "-"} (row bani ${row.createdAt.toISOString()})`
    );
  }
  // Audit log: ye date kis action ne likhi.
  for (const caseId of [...new Set(attestations.map((row) => row.caseId))]) {
    const logs = await prisma.officeAuditLog.findMany({
      where: { entityId: caseId },
      orderBy: { createdAt: "asc" },
      select: { action: true, actorRole: true, createdAt: true, after: true },
    });
    for (const log of logs) {
      const text = JSON.stringify(log.after ?? "");
      if (/attestation|set|date|payment|service/i.test(log.action) || text.includes(text.slice(0, 0) + date.toISOString().slice(0, 10))) {
        console.log(`  log ${log.createdAt.toISOString()} ${log.action} (${log.actorRole}) ${text.slice(0, 160)}`);
      }
    }
  }
  const printing = await prisma.case.findMany({
    where: { expectedPrintingDate: { gte: date, lt: next } },
    select: { caseNumber: true, status: true },
  });
  for (const row of printing) console.log(`Expected printing date: ${row.caseNumber} (${row.status})`);
  if (!attestations.length && !printing.length) console.log("Is din koi attestation / printing date nahi.");
}

async function main() {
  // Attached AI (key kabhi print nahi hoti).
  const bot = await prisma.siteSettings.findFirst({ select: { botEnabled: true, botProvider: true, botModel: true, botApiKey: true } });
  console.log(
    `AI: provider=${bot?.botProvider ?? "-"} model=${bot?.botModel || "-"} enabled=${bot?.botEnabled ?? false} key=${bot?.botApiKey ? "hai" : "nahi"}`
  );
  const dateArg = process.argv.indexOf("--date");
  if (dateArg > 0 && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[dateArg + 1] || "")) {
    await inspectDate(process.argv[dateArg + 1]);
    return;
  }
  const fallback = await prisma.workingDayCache.findMany({
    where: { source: "FALLBACK" },
    orderBy: { candidateDate: "asc" },
  });
  const poisoned = fallback.filter((row) => row.isCandidateWorking && builtinHolidayReason(row.candidateDate, "PK"));
  console.log(`WorkingDayCache FALLBACK rows: ${fallback.length} (chhutti ko "working" kehne wali: ${poisoned.length})`);
  for (const row of poisoned) {
    console.log(`  - ${formatDmy(row.candidateDate)} "working" likha — asal: ${builtinHolidayReason(row.candidateDate, "PK")}`);
  }
  const aiOpenHolidays = (
    await prisma.workingDayCache.findMany({ where: { source: "AI", isCandidateWorking: true } })
  ).filter((row) => builtinHolidayReason(row.candidateDate, "PK"));
  console.log(`AI ne chhutti ko working kaha: ${aiOpenHolidays.length}`);
  for (const row of aiOpenHolidays) {
    console.log(`  - ${formatDmy(row.candidateDate)} — asal: ${builtinHolidayReason(row.candidateDate, "PK")}`);
  }
  const closures = await prisma.holidayClosure.groupBy({ by: ["scope"], _count: true });
  console.log(`HolidayClosure rows: ${closures.map((row) => `${row.scope} ${row._count}`).join(", ") || "koi nahi"}`);

  const cases = await prisma.case.findMany({
    where: { status: { not: "CANCELLED" }, attestations: { some: { status: { not: "DONE" } } } },
    select: { id: true, caseNumber: true, setId: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  const days = new DayResolver();
  let problemCases = 0;
  let wouldMove = 0;
  let wouldFill = 0;
  for (const item of cases) {
    const problems = await attestationDateProblems(item.id, prisma, days);
    const plan = await computeAttestationPlan(item.id, { resolver: days });
    const moves = plan.filter((change) => change.from && change.from.getTime() !== change.to.getTime());
    const fills = plan.filter((change) => !change.from);
    if (problems.length === 0 && plan.length === 0) continue;
    problemCases += 1;
    wouldMove += moves.length;
    wouldFill += fills.length;
    console.log(`\n${item.caseNumber} (${item.status}${item.setId ? ", set" : ", bina set"})`);
    for (const problem of problems) console.log(`  ✗ ${problem}`);
    for (const change of moves) console.log(`  → ${change.name}: ${formatDmy(change.from!)} → ${formatDmy(change.to)} (${change.why})`);
    for (const change of fills) console.log(`  + ${change.name}: khali → ${formatDmy(change.to)}`);
  }
  console.log(
    `\nKhule cases (pending attestation): ${cases.length}; masle wale: ${problemCases}; ` +
      `"Sab dates check karein" ${wouldMove} date(s) aage karega, ${wouldFill} khali bharega.`
  );

  // DONE steps jin ki (scheduled) date band din par hai — system khud nahi
  // badalta (kaam ho chuka); admin chahe to Attestations tab se badle.
  const done = await prisma.caseAttestation.findMany({
    where: { status: "DONE", scheduledDate: { gte: new Date(Date.UTC(2026, 0, 1)) }, case: { status: { not: "CANCELLED" } } },
    include: { attestationType: { select: { name: true } }, case: { select: { caseNumber: true } } },
  });
  for (const row of done) {
    const verdict = await days.verdict(row.scheduledDate!, { country: "PK" });
    if (!verdict.open) {
      console.log(`DONE (khud nahi badlega): ${row.case.caseNumber} ${row.attestationType.name} ${formatDmy(row.scheduledDate!)} — ${verdict.reason}`);
    }
  }
  // Expected printing dates (khule cases).
  const printing = await prisma.case.findMany({
    where: { status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] }, expectedPrintingDate: { not: null } },
    select: { caseNumber: true, expectedPrintingDate: true },
  });
  let badPrinting = 0;
  for (const row of printing) {
    const verdict = await days.verdict(row.expectedPrintingDate!, { country: "PK" });
    if (!verdict.open) {
      badPrinting += 1;
      console.log(`Expected printing date band din par: ${row.caseNumber} ${formatDmy(row.expectedPrintingDate!)} — ${verdict.reason}`);
    }
  }
  console.log(`Expected printing dates band din par: ${badPrinting} (recheck / cron theek karega)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

-- §W57 — purane (so rahe) extra faisle PERMANENT khatam.
-- Masla: payment delete / un-receive ke baad extra ka tukra (ExtraShareTranche)
-- sirf "0 nisbat" par so jata tha, aur purana Case.extraSharePercent bhi case
-- par reh jata tha. Nayi payment aate hi purani extra + purana % / Rs wapas zinda
-- ho jata tha. Ab code dono nahi rakhta; ye migration maujooda data saaf karti
-- hai. Schema nahi badalta. Dobara chalane par kuch nahi badalta (idempotent).

-- 1) Purana %-faisla jis ka tukra kabhi nahi bana aur abhi extra hai → tukra
--    (W56 jaisa, wahi raqam jo ledger mein credit hai) — taake neeche % hatane
--    se credit shuda hissa ulta na ho.
INSERT INTO "ExtraShareTranche" ("id", "caseId", "extraAmount", "shareAmount", "mode", "percent", "receivedAt", "decidedById", "createdAt")
SELECT 'legacy57_' || c."id",
       c."id",
       r."received" - c."agreedAmount",
       ROUND((r."received" - c."agreedAmount") * c."extraSharePercent" / 100, 2),
       'PERCENT',
       c."extraSharePercent",
       r."received",
       'system-wave57',
       CURRENT_TIMESTAMP
FROM "Case" c
JOIN "BookingOffice" o ON o."id" = c."bookingOfficeId"
JOIN (
  SELECT "caseId", SUM("amount") AS "received"
  FROM "Payment"
  WHERE "status" = 'RECEIVED'
  GROUP BY "caseId"
) r ON r."caseId" = c."id"
WHERE o."type" = 'FIXED_COMMISSION'
  AND c."extraSharePercent" IS NOT NULL
  AND r."received" > c."agreedAmount"
  AND NOT EXISTS (SELECT 1 FROM "ExtraShareTranche" t WHERE t."caseId" = c."id");

-- 2) Case.extraSharePercent ab kahin nahi parha / likha jata.
UPDATE "Case" SET "extraSharePercent" = NULL WHERE "extraSharePercent" IS NOT NULL;

-- 3) So rahe tukre: kul RECEIVED us tukre ke faisle waqt (receivedAt) se kam →
--    tukra delete (baad wale bhi isi shart mein aa jate hain), phir EXTRA_SHARE
--    ledger ko baqi (poore) tukron ke hisse ke barabar.
DROP TABLE IF EXISTS "w57_affected";
CREATE TEMP TABLE "w57_affected" AS
SELECT DISTINCT t."caseId" AS "caseId"
FROM "ExtraShareTranche" t
WHERE t."receivedAt" > COALESCE(
  (SELECT SUM(p."amount") FROM "Payment" p WHERE p."caseId" = t."caseId" AND p."status" = 'RECEIVED'),
  0
);

DELETE FROM "ExtraShareTranche" t
WHERE t."caseId" IN (SELECT "caseId" FROM "w57_affected")
  AND t."receivedAt" > COALESCE(
    (SELECT SUM(p."amount") FROM "Payment" p WHERE p."caseId" = t."caseId" AND p."status" = 'RECEIVED'),
    0
  );

INSERT INTO "LedgerEntry" ("id", "bookingOfficeId", "memberId", "caseId", "type", "direction", "amount", "entryDate", "remarks", "createdById", "createdAt")
SELECT 'w57_' || md5(c."id" || clock_timestamp()::text),
       c."bookingOfficeId",
       COALESCE(
         c."commissionMemberId",
         (SELECT m."id" FROM "BookingOfficeMember" m
          WHERE m."bookingOfficeId" = c."bookingOfficeId" AND m."adminId" = c."createdByAdminId"
          LIMIT 1)
       ),
       c."id",
       'EXTRA_SHARE',
       CASE WHEN x."diff" > 0 THEN 'CREDIT' ELSE 'DEBIT' END,
       ABS(x."diff"),
       (now() AT TIME ZONE 'Asia/Karachi')::date,
       'Extra faisla khatam (payment / agreed badli) — nayi extra par naya faisla',
       'system-wave57',
       CURRENT_TIMESTAMP
FROM "Case" c
JOIN (
  SELECT a."caseId",
         COALESCE((SELECT SUM(t."shareAmount") FROM "ExtraShareTranche" t WHERE t."caseId" = a."caseId"), 0)
         - COALESCE((SELECT SUM(CASE WHEN l."direction" = 'CREDIT' THEN l."amount" ELSE -l."amount" END)
                     FROM "LedgerEntry" l
                     WHERE l."caseId" = a."caseId" AND l."type" = 'EXTRA_SHARE'), 0) AS "diff"
  FROM "w57_affected" a
) x ON x."caseId" = c."id"
WHERE x."diff" <> 0;

UPDATE "Case" c
SET "extraShareCreditedAt" = NULL
WHERE c."id" IN (SELECT "caseId" FROM "w57_affected")
  AND NOT EXISTS (SELECT 1 FROM "ExtraShareTranche" t WHERE t."caseId" = c."id");

DROP TABLE IF EXISTS "w57_affected";

-- 4) Partner case jis ka saara paisa / kharcha wapas ho chuka (sab hissay 0):
--    purana profitShareSnapshot (purane %) hatao — agli asal payment par us waqt
--    ke % se naya snapshot (code bhi ab yahi karta hai).
UPDATE "Case" c
SET "profitShareSnapshot" = NULL, "profitFinalizedAt" = NULL
FROM "BookingOffice" o
WHERE o."id" = c."bookingOfficeId"
  AND o."type" = 'PROFIT_SHARE'
  AND c."profitShareSnapshot" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."caseId" = c."id" AND p."status" = 'RECEIVED')
  AND NOT EXISTS (SELECT 1 FROM "CaseExpense" e WHERE e."caseId" = c."id" AND (e."kind" IS NULL OR e."kind" <> 'DEPT_COMMISSION'))
  AND COALESCE((SELECT SUM(CASE WHEN l."direction" = 'CREDIT' THEN l."amount" ELSE -l."amount" END)
                FROM "LedgerEntry" l
                WHERE l."caseId" = c."id" AND l."type" = 'DEPT_COMMISSION'), 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM "LedgerEntry" l
    WHERE l."caseId" = c."id" AND l."type" IN ('PROFIT_SHARE', 'ADJUSTMENT')
    GROUP BY l."memberId"
    HAVING SUM(CASE WHEN l."direction" = 'CREDIT' THEN l."amount" ELSE -l."amount" END) <> 0
  );

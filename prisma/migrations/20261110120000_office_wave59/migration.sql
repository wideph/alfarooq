-- §W59 — extra service ke purane auto remarks / naam saaf alfaaz mein.
-- Masla: booking office extra service lagata to do remarks bante thay jo
-- service ka auto naam (jis mein attestations pehle se thin) phir attestation
-- list dohrate thay, "(reissue print ke baad)" / "dobara / nayi" samajh nahi
-- aata tha, aur filing wale remark mein raqam (Rs) bhi thi — filing ko paisa
-- nahi dikhna chahiye. Naya code ek saaf remark banata hai; ye migration
-- purane remarks ka text naye andaz mein likhti hai (recipients / seen jaise
-- hain). Schema nahi badalta. Naya text purane pattern se match nahi karta —
-- dobara chalane par kuch nahi badalta (idempotent).

-- 1) Reissue (filing + admin): naam + raqam hatao.
UPDATE "CaseRemark"
SET "text" = regexp_replace(
  "text",
  '^Document reissue \(extra service "[^"]*", Rs [0-9][0-9,.]*\): ',
  'Extra service — Filing: document dobara banana hai — hidayat: '
)
WHERE "text" ~ '^Document reissue \(extra service "[^"]*", Rs [0-9][0-9,.]*\): ';

-- 2) Attestations (reissue ke saath).
UPDATE "CaseRemark"
SET "text" = regexp_replace(
  "text",
  '^Extra service "[^"]*": attestations (.*) \(reissue print ke baad\)$',
  'Extra service — Attestation (dobara print ke baad): \1.'
)
WHERE "text" ~ '^Extra service "[^"]*": attestations .* \(reissue print ke baad\)$';

-- 3) Attestations (bina reissue).
UPDATE "CaseRemark"
SET "text" = regexp_replace(
  "text",
  '^Extra service "[^"]*": attestations (.*) dobara / nayi$',
  'Extra service — Attestation: \1.'
)
WHERE "text" ~ '^Extra service "[^"]*": attestations .* dobara / nayi$';

-- 4) Musadiqa (sirf admin — raqam rehti hai).
UPDATE "CaseRemark"
SET "text" = regexp_replace(
  "text",
  '^Is case ne Musadiqa apply kar diya hai \(extra service "[^"]*", (Rs [0-9][0-9,.]*)\)$',
  'Extra service (\1) — Admin: Musadiqa apply ho gaya — Musadiqa queue se "Attested" karein.'
)
WHERE "text" ~ '^Is case ne Musadiqa apply kar diya hai \(extra service "[^"]*", Rs [0-9][0-9,.]*\)$';

-- 5) Custom (sirf admin) — note wala pehle, phir bina note.
UPDATE "CaseRemark"
SET "text" = regexp_replace(
  "text",
  '^Custom extra service: (.*) \((Rs [0-9][0-9,.]*)\) — (.*)$',
  'Extra service (\2) — Admin: \1 — kaam poora hone par "Complete" karein. Note: \3'
)
WHERE "text" ~ '^Custom extra service: .* \(Rs [0-9][0-9,.]*\) — ';

UPDATE "CaseRemark"
SET "text" = regexp_replace(
  "text",
  '^Custom extra service: (.*) \((Rs [0-9][0-9,.]*)\)$',
  'Extra service (\2) — Admin: \1 — kaam poora hone par "Complete" karein.'
)
WHERE "text" ~ '^Custom extra service: .* \(Rs [0-9][0-9,.]*\)$';

-- 6) Service ka auto naam: "Document reissue + A, B" → "Document reissue +
--    Attestation (A, B)". Sirf wahi naam badalta hai jo hisson se bane purane
--    auto naam ke bilkul barabar ho (booking office ka apna naam nahi chhuta).
WITH names AS (
  SELECT s."id",
         s."name",
         CASE WHEN s."reissue" THEN 'Document reissue' END AS reissue_part,
         (
           SELECT string_agg(t."name", ', ' ORDER BY e.ord)
           FROM jsonb_array_elements_text(
                  CASE WHEN jsonb_typeof(s."attestationIds"::jsonb) = 'array' THEN s."attestationIds"::jsonb ELSE '[]'::jsonb END
                ) WITH ORDINALITY AS e(attestation_id, ord)
           JOIN "CaseAttestation" a ON a."id" = e.attestation_id
           JOIN "AttestationType" t ON t."id" = a."attestationTypeId"
         ) AS attestation_part,
         CASE WHEN s."musadiqa" THEN 'Musadiqa' END AS musadiqa_part,
         NULLIF(s."customName", '') AS custom_part
  FROM "CaseService" s
  WHERE s."attestationIds" IS NOT NULL
)
UPDATE "CaseService" s
SET "name" = left(concat_ws(' + ', n.reissue_part, 'Attestation (' || n.attestation_part || ')', n.musadiqa_part, n.custom_part), 200)
FROM names n
WHERE s."id" = n."id"
  AND n.attestation_part IS NOT NULL
  AND s."name" = concat_ws(' + ', n.reissue_part, n.attestation_part, n.musadiqa_part, n.custom_part);

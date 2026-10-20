# Wave 24 Plan — Case detail UX + filing files visibility + Mofa Saudi dates

## Context
User reported 5 issues on case AF-2026-000027 (screenshots provided).

## Stage 1 — Investigation (parallel, read-only)
- I-1: Filing files visibility — files GET dept filtering + DeptCaseView rendering. Filing files must NOT appear in printing dept view, but printing/attestation users keep VIEW permission.
- I-2: Case detail page duplication — page header vs CaseHeaderStrip vs status card repeat same info.
- I-3: Attestations & dates tab blinking — find re-render/refresh loop.
- I-4: "Done" default label — rename to "Completed at".
- I-5: Mofa Saudi missing dates — live DB query for AF-2026-000027 attestation date fields + date-engine/ai-dates code path.

## Stage 2 — Fixes
Apply targeted fixes (small scope — direct edits, verified in /tmp clone).

## Stage 3 — Verify & Deliver
- /tmp/push14 clone: rsync --delete (keep .env), npm install, prisma generate, tsc 0, lint 0, build exit 0 (direct 5432 DATABASE_URL).
- Any live data fix if needed.
- Commit + push with PAT, verify via ls-remote.
- Update docs/office-module/05_AGENT_LOG.md.
- Roman Urdu summary.

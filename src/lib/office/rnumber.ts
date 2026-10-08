// docs/office-module/06 §N5 — r-number (roll number) last-2-digit logic.

// Categories whose set selection is affected by the r-number suffix.
export const RNUMBER_DIMMED_CATEGORIES = ["Dip BBTE DAE 3Y", "BBTE DBA 3Y"] as const;

export const DIMMED_REASON = "Ye set is r-number ke liye available nahi";

// Last 2 characters of the roll number when both are digits, else null.
export function parseRollSuffix(rollNumber: string | null | undefined): number | null {
  if (!rollNumber) return null;
  const trimmed = rollNumber.trim();
  if (trimmed.length < 2) return null;
  const lastTwo = trimmed.slice(-2);
  if (!/^\d{2}$/.test(lastTwo)) return null;
  return Number(lastTwo);
}

// Suffix → forced Bord/UV-idcc year (§N5: 19→2020, 20→2021, 21→2022).
// null means "use the 2019 WorkingDatePool random pick".
export function boardYearForSuffix(suffix: number | null): number | null {
  if (suffix === 19) return 2020;
  if (suffix === 20) return 2021;
  if (suffix === 21) return 2022;
  return null;
}

// A set is dimmed for suffixes 22..29 when it is the full set-(i) family
// (first set, contains the Saud MBC chain) of an r-number category.
export function isSetDimmed(categoryName: string | null | undefined, rollNumber: string | null | undefined, setName: string): boolean {
  if (!categoryName || !(RNUMBER_DIMMED_CATEGORIES as readonly string[]).includes(categoryName)) return false;
  const suffix = parseRollSuffix(rollNumber);
  if (suffix === null || suffix < 22 || suffix > 29) return false;
  // Set names are seeded as "Set (i): Bord + UV idcc + ..." — index-0 full set.
  return setName.includes("(i)");
}

export type SetDimInfo = { dimmed: boolean; reason: string | null };

// Per-set dim info for the setup/sets API when a roll number is provided.
export function dimmedSetNames<T extends { id: string; name: string }>(
  categoryName: string | null | undefined,
  rollNumber: string | null | undefined,
  sets: T[]
): Array<T & SetDimInfo> {
  return sets.map((set) => {
    const dimmed = isSetDimmed(categoryName, rollNumber, set.name);
    return { ...set, dimmed, reason: dimmed ? DIMMED_REASON : null };
  });
}

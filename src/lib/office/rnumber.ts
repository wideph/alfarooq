// docs/office-module/06 §N5 — Roll Number last-2-digit logic.

// Categories whose set selection is affected by the Roll Number suffix.
export const RNUMBER_DIMMED_CATEGORIES = ["DAE 3Y BBTE", "DBA 3Y BBTE"] as const;

export const DIMMED_REASON = "Ye Set of Attestations is Roll Number ke liye available nahi";

// Last 2 characters of the roll number when both are digits, else null.
export function parseRollSuffix(rollNumber: string | null | undefined): number | null {
  if (!rollNumber) return null;
  const trimmed = rollNumber.trim();
  if (trimmed.length < 2) return null;
  const lastTwo = trimmed.slice(-2);
  if (!/^\d{2}$/.test(lastTwo)) return null;
  return Number(lastTwo);
}

// Suffix → forced Board/UV-ibcc year (§N5: 19→2020, 20→2021, 21→2022).
// null means "use the 2019 WorkingDatePool random pick".
export function boardYearForSuffix(suffix: number | null): number | null {
  if (suffix === 19) return 2020;
  if (suffix === 20) return 2021;
  if (suffix === 21) return 2022;
  return null;
}

// §N5 / §W63 — suffix 22..29 par DO sets dim (owner): (i) Board + UV ibcc +
// Special Mofa + Saudi Embassy + Mofa Saudi, aur (v) Board + UV ibcc. Pehle
// sirf naam mein "(i)" wala dim hota tha — (v) dikhta rehta tha. Pehchan set ke
// STEPS se (admin naam badle to bhi chale); steps na hon to naam "(i)" / "(v)".
const DIMMED_STEP_SETS = [
  ["BOARD", "UV_IBCC", "SPECIAL_MOFA", "SAUDI_EMBASSY", "MOFA_SAUDI"],
  ["BOARD", "UV_IBCC"],
].map((keys) => [...keys].sort().join("+"));

function stepSignature(steps: Array<{ stepKey: string }>) {
  return steps
    .map((step) => (step.stepKey === "MOFA_SAUD" ? "MOFA_SAUDI" : step.stepKey))
    .sort()
    .join("+");
}

export function isSetDimmed(
  categoryName: string | null | undefined,
  rollNumber: string | null | undefined,
  set: { name: string; steps?: Array<{ stepKey: string }> | null }
): boolean {
  if (!categoryName || !(RNUMBER_DIMMED_CATEGORIES as readonly string[]).includes(categoryName)) return false;
  const suffix = parseRollSuffix(rollNumber);
  if (suffix === null || suffix < 22 || suffix > 29) return false;
  if (set.steps && set.steps.length > 0) return DIMMED_STEP_SETS.includes(stepSignature(set.steps));
  // Seed naam: "Set of Attestations (i): …" / "Set of Attestations (v): …".
  return /\((i|v)\)/.test(set.name);
}

export type SetDimInfo = { dimmed: boolean; reason: string | null };

// Per-set dim info for the setup/sets API when a roll number is provided.
export function dimmedSetNames<T extends { id: string; name: string; steps?: Array<{ stepKey: string }> | null }>(
  categoryName: string | null | undefined,
  rollNumber: string | null | undefined,
  sets: T[]
): Array<T & SetDimInfo> {
  return sets.map((set) => {
    const dimmed = isSetDimmed(categoryName, rollNumber, set);
    return { ...set, dimmed, reason: dimmed ? DIMMED_REASON : null };
  });
}

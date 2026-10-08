// Tabular (civil) Islamic / Hijri calendar conversion.
// NOTE: this is the arithmetic "civil" tabular calendar — the real Hijri calendar
// is moon-sighting based, so results can be ±1 day off the announced date.
// Used only for display on the Saud MBC step (docs/office-module/06 §N5).

export type HijriDate = {
  day: number;
  month: number; // 1..12
  year: number;
  formatted: string; // "12 Rabi-ul-Awwal 1447"
};

export const HIJRI_MONTHS = [
  "Muharram",
  "Safar",
  "Rabi-ul-Awwal",
  "Rabi-us-Sani",
  "Jumada-al-Awwal",
  "Jumada-us-Sani",
  "Rajab",
  "Shaban",
  "Ramadan",
  "Shawwal",
  "Dhul-Qadah",
  "Dhul-Hijjah",
] as const;

// Gregorian date → Julian Day Number (integer, for UTC midnight dates).
function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

// Kuwaiti algorithm (civil tabular calendar, epoch 16 July 622 CE Julian).
export function toHijri(date: Date): HijriDate {
  const jdn = gregorianToJdn(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  // Days since Islamic epoch (civil epoch = JDN 1948440).
  const l = jdn - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l1 = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l1) / 5316) * Math.floor((50 * l1) / 17719) +
    Math.floor(l1 / 5670) * Math.floor((43 * l1) / 15238);
  const l2 =
    l1 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l2) / 709);
  const day = l2 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;

  return {
    day,
    month,
    year,
    formatted: `${day} ${HIJRI_MONTHS[month - 1]} ${year}`,
  };
}

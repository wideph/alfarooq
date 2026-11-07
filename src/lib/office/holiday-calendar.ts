import { toHijri } from "@/lib/office/hijri";

// §W60 — BUILT-IN chhuttiyon ka calendar (code mein, DB / AI / internet ke
// baghair). Pehle sari "chhutti" ki pehchaan AI ke andaze ya admin table par
// thi — AI fail ho (timeout) to sirf Sat/Sun dekha jata tha aur wo "working
// day" verdict hamesha ke liye cache ho jata tha. Natija: 9 Nov (Iqbal Day)
// jaisi pakki chhutti par bhi date lag gayi. Ab ye calendar har date par
// HAMESHA lagta hai; AI aur admin table sirf MAZEED chhuttiyan jod sakte hain.
//
// Islamic chhuttiyan Umm al-Qura calendar (Saudi ka sarkari calendar, Intl
// "islamic-umalqura") se. Pakistan mein chand aksar 1 (kabhi 2) din baad
// dekha jata hai, is liye Pakistan ki har Islamic chhutti ki window 2 din
// aage tak barhai gayi hai (conservative: shak ho to chhutti samjho — ek din
// der se date behtar hai band daftar ki date se). Admin kisi khaas din ko
// "Working days" panel se khula mark kar sakta hai (MANUAL override).

export type CalendarCountry = "PK" | "SA";

type HijriDay = { year: number; month: number; day: number };

let umalqura: Intl.DateTimeFormat | null | undefined;

function umalquraFormatter(): Intl.DateTimeFormat | null {
  if (umalqura !== undefined) return umalqura;
  try {
    const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      timeZone: "UTC",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
    // Runtime ke paas Islamic calendar data na ho to "islamic-umalqura" chup
    // chap gregorian de deta hai — 2025-03-30 = 1 Shawwal 1446 se check.
    const probe = hijriFrom(formatter, new Date(Date.UTC(2025, 2, 30)));
    umalqura = probe && probe.year === 1446 && probe.month === 10 && probe.day === 1 ? formatter : null;
  } catch {
    umalqura = null;
  }
  return umalqura;
}

function hijriFrom(formatter: Intl.DateTimeFormat, date: Date): HijriDay | null {
  const parts = formatter.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const result = { year: value("year"), month: value("month"), day: value("day") };
  return Number.isFinite(result.year) && Number.isFinite(result.month) && Number.isFinite(result.day) ? result : null;
}

// Gregorian (UTC midnight) → Hijri (Umm al-Qura; data na ho to tabular calendar).
export function hijriDay(date: Date): HijriDay {
  const formatter = umalquraFormatter();
  const parsed = formatter ? hijriFrom(formatter, date) : null;
  if (parsed) return parsed;
  const tabular = toHijri(date);
  return { year: tabular.year, month: tabular.month, day: tabular.day };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

// [month, day, naam, pehla saal (optional)]
const PK_FIXED: Array<[number, number, string, number?]> = [
  [2, 5, "Kashmir Day"],
  [3, 23, "Pakistan Day"],
  [5, 1, "Labour Day"],
  [5, 28, "Youm-e-Takbeer", 2024],
  [8, 14, "Independence Day"],
  [9, 6, "Defence Day"],
  [11, 9, "Iqbal Day"],
  [12, 25, "Quaid-e-Azam Day"],
];

// Hijri [month, pehla din, aakhri din, naam].
const PK_ISLAMIC: Array<[number, number, number, string]> = [
  [10, 1, 3, "Eid ul Fitr"],
  [12, 10, 12, "Eid ul Adha"],
  [1, 9, 10, "Ashura (9-10 Muharram)"],
  [3, 12, 12, "Eid Milad un Nabi"],
];
// Pakistan ka chand Umm al-Qura se kitne din tak baad ho sakta hai.
const PK_MOON_LAG_DAYS = 2;

const SA_FIXED: Array<[number, number, string, number?]> = [
  [2, 22, "Saudi Founding Day", 2022],
  [9, 23, "Saudi National Day"],
];

// Saudi sarkari daftar (Mofa Saudi) Eid par lambi chhutti karte hain.
const SA_ISLAMIC: Array<[number, number, number, number, string]> = [
  // [shuru month, shuru din, khatam month, khatam din, naam]
  [9, 25, 10, 10, "Eid ul Fitr (Saudi sarkari chhutti)"],
  [12, 5, 12, 15, "Eid ul Adha (Saudi sarkari chhutti)"],
];

function fixedReason(date: Date, list: Array<[number, number, string, number?]>): string | null {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  for (const [m, d, name, since] of list) {
    if (m === month && d === day && (!since || date.getUTCFullYear() >= since)) return name;
  }
  return null;
}

function inHijriRange(h: HijriDay, startMonth: number, startDay: number, endMonth: number, endDay: number) {
  const value = h.month * 100 + h.day;
  return value >= startMonth * 100 + startDay && value <= endMonth * 100 + endDay;
}

/**
 * Built-in calendar ke mutabiq is din chhutti hai? Naam (wajah) ya null.
 * Weekend yahan nahi — wo day-rules dekhta hai.
 */
export function builtinHolidayReason(dateInput: Date, country: CalendarCountry): string | null {
  const date = new Date(Date.UTC(dateInput.getUTCFullYear(), dateInput.getUTCMonth(), dateInput.getUTCDate()));
  if (country === "PK") {
    const fixed = fixedReason(date, PK_FIXED);
    if (fixed) return fixed;
    for (let lag = 0; lag <= PK_MOON_LAG_DAYS; lag += 1) {
      const h = hijriDay(addDays(date, -lag));
      for (const [month, first, last, name] of PK_ISLAMIC) {
        if (h.month === month && h.day >= first && h.day <= last) {
          return lag === 0 ? name : `${name} (Pakistan mein chand ${lag} din baad ho sakta hai)`;
        }
      }
    }
    return null;
  }
  const fixed = fixedReason(date, SA_FIXED);
  if (fixed) return fixed;
  const h = hijriDay(date);
  for (const [startMonth, startDay, endMonth, endDay, name] of SA_ISLAMIC) {
    if (inHijriRange(h, startMonth, startDay, endMonth, endDay)) return name;
  }
  return null;
}

// Kisi saal ki sari built-in chhuttiyan (admin panel mein dikhane ke liye).
export function builtinHolidaysOfYear(year: number, country: CalendarCountry): Array<{ date: string; reason: string }> {
  const out: Array<{ date: string; reason: string }> = [];
  for (let date = new Date(Date.UTC(year, 0, 1)); date.getUTCFullYear() === year; date = addDays(date, 1)) {
    const reason = builtinHolidayReason(date, country);
    if (reason) out.push({ date: date.toISOString().slice(0, 10), reason });
  }
  return out;
}

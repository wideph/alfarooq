import { Prisma } from "@prisma/client";

export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;

export function dec(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined || value === "") return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

// Round half-up to 2 decimals (money).
export function round2(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function sum(values: Array<Prisma.Decimal | number | string | null | undefined>) {
  return values.reduce<Prisma.Decimal>((acc, value) => acc.plus(dec(value)), new Prisma.Decimal(0));
}

export function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  return Number(round2(dec(value)).toString());
}

// Parses user input; returns null when it is not a valid non-negative amount.
export function parseAmount(input: unknown, { allowZero = true } = {}): Prisma.Decimal | null {
  if (input === null || input === undefined || input === "") return null;
  const text = typeof input === "number" ? String(input) : String(input).trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = new Prisma.Decimal(text);
  if (value.isNegative()) return null;
  if (!allowZero && value.isZero()) return null;
  return value;
}

export function parsePercent(input: unknown): Prisma.Decimal | null {
  const value = parseAmount(input);
  if (!value || value.greaterThan(100)) return null;
  return value;
}

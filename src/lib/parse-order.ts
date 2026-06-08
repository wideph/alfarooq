/** Parse admin preference/order (supports decimals like 1.5). */
export function parseOrder(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(num) ? num : fallback;
}

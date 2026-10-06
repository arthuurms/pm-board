// Pure helpers (no server imports) so client components, API routes and the MCP route can share them.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

export function isValidMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// "YYYY-MM" of an instant, in Brasília time (UTC-3, no DST).
export function brtMonthOf(date: Date): string {
  const b = new Date(date.getTime() - BRT_OFFSET_MS);
  return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentBrtMonth(): string {
  return brtMonthOf(new Date());
}

// Legacy rows have no month yet: fall back to the month they were created in.
export function goalMonth(goal: { month?: string | null; createdAt: string | Date }): string {
  return goal.month ?? brtMonthOf(new Date(goal.createdAt));
}

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// Calendar-day helpers keyed by "YYYY-MM-DD" in Brasília time (UTC-3, no DST).
// Pure functions so client components can use them.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function dayKeyOf(date: Date | string | number): string {
  return new Date(new Date(date).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayKey(): string {
  return dayKeyOf(Date.now());
}

// Noon UTC avoids any day rollover when shifting by whole days.
function at(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

export function addDays(key: string, n: number): string {
  const d = at(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(key: string): number {
  return at(key).getUTCDay();
}

export function weekdayShort(key: string): string {
  return WEEKDAYS_SHORT[weekdayOf(key)];
}

// Monday of the week containing `key`.
export function mondayOf(key: string): string {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

export function weeksBetween(fromMonday: string, toMonday: string): number {
  return Math.round((at(toMonday).getTime() - at(fromMonday).getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function dayNumber(key: string): number {
  return at(key).getUTCDate();
}

export function relativeLabel(key: string, today: string): string | null {
  if (key === today) return "Hoje";
  if (key === addDays(today, 1)) return "Amanhã";
  if (key === addDays(today, -1)) return "Ontem";
  return null;
}

// "6 de outubro"
export function formatDayMonth(key: string): string {
  return at(key).toLocaleDateString("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" });
}

// "terça-feira, 6 de outubro"
export function formatDayLong(key: string): string {
  return at(key).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

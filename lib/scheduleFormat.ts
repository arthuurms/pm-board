// Pure helpers (no server imports) so client components can use them too.
export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function isValidTimeOfDay(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function describeSchedule(timeOfDay: string, daysOfWeek: number[]): string {
  const days = [...daysOfWeek].sort((a, b) => a - b);
  let label: string;
  if (days.length === 7) label = "Todo dia";
  else if (days.join(",") === "1,2,3,4,5") label = "Dias úteis";
  else label = days.map((d) => WEEKDAY_LABELS[d]).join(", ");
  return `${label} às ${timeOfDay}`;
}

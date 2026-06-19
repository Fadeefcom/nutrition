export function toIsoDate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number) {
  const date = parseIsoDateLocal(isoDate);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function formatShortDate(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    parseIsoDateLocal(isoDate),
  );
}

export function formatWeekday(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(
    parseIsoDateLocal(isoDate),
  );
}

export function parseIsoDateLocal(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

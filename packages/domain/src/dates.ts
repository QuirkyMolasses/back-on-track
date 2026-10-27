import { dateSchema } from './model';
const MS_PER_DAY = 86_400_000;
/** Calendar days, independent of local clock and DST. Input dates are Europe/Berlin dates. */
export function dayNumber(date: string): number {
  return Date.parse(`${dateSchema.parse(date)}T00:00:00Z`) / MS_PER_DAY;
}
export function addDays(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error('Days must be an integer');
  return dateSchema.parse(
    new Date((dayNumber(date) + days) * MS_PER_DAY).toISOString().slice(0, 10),
  );
}
export function todayInBerlin(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join('-');
}

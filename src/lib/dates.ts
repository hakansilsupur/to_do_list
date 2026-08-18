import type { Bucket } from '../types';

const MS_PER_DAY = 86_400_000;

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

/**
 * Format a Date as a local yyyy-mm-dd key. Deliberately not toISOString(), which
 * converts to UTC and can shift the day for anyone not on GMT.
 */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a yyyy-mm-dd key back into a Date at local midnight. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Whole days from today to `iso`. Negative means the past. */
export function daysFromToday(iso: string): number {
  const start = fromISODate(todayISO()).getTime();
  const end = fromISODate(iso).getTime();
  return Math.round((end - start) / MS_PER_DAY);
}

export function isOverdue(dueDate: string | null, done: boolean): boolean {
  if (!dueDate || done) return false;
  return daysFromToday(dueDate) < 0;
}

/** Which time bucket a due date falls into, relative to right now. */
export function bucketFor(dueDate: string | null, done: boolean): Bucket {
  if (!dueDate) return 'someday';
  const delta = daysFromToday(dueDate);
  if (delta < 0) return done ? 'today' : 'overdue';
  if (delta === 0) return 'today';
  if (delta === 1) return 'tomorrow';
  if (delta <= 7) return 'upcoming';
  return 'later';
}

export const BUCKET_ORDER: Bucket[] = [
  'overdue',
  'today',
  'tomorrow',
  'upcoming',
  'later',
  'someday',
];

export const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  upcoming: 'This week',
  later: 'Later',
  someday: 'Someday',
};

/** Short human label for a due-date chip: "Today", "Fri", "Mar 4", "3d ago". */
export function formatDueLabel(dueDate: string | null): string {
  if (!dueDate) return '';
  const delta = daysFromToday(dueDate);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta < 0) return `${Math.abs(delta)}d ago`;
  if (delta <= 6) {
    const name = WEEKDAY_NAMES[fromISODate(dueDate).getDay()];
    return name.charAt(0).toUpperCase() + name.slice(1, 3);
  }
  const date = fromISODate(dueDate);
  const month = MONTH_NAMES[date.getMonth()];
  const label = `${month.charAt(0).toUpperCase()}${month.slice(1, 3)} ${date.getDate()}`;
  return date.getFullYear() === new Date().getFullYear()
    ? label
    : `${label}, ${date.getFullYear()}`;
}

/** Long form for the detail drawer: "Monday, March 4". */
export function formatDueLong(dueDate: string | null): string {
  if (!dueDate) return 'No date';
  const date = fromISODate(dueDate);
  const weekday = WEEKDAY_NAMES[date.getDay()];
  const month = MONTH_NAMES[date.getMonth()];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(weekday)}, ${cap(month)} ${date.getDate()}`;
}

/**
 * The next occurrence of a weekday, strictly in the future — "monday" on a
 * Monday means the Monday a week out, matching how people say it.
 */
export function nextWeekday(name: string, from: string = todayISO()): string | null {
  const target = WEEKDAY_NAMES.indexOf(name as (typeof WEEKDAY_NAMES)[number]);
  if (target === -1) return null;
  const current = fromISODate(from).getDay();
  const delta = ((target - current + 7) % 7) || 7;
  return addDays(from, delta);
}

export function monthIndex(name: string): number {
  return MONTH_NAMES.findIndex((m) => m === name || m.slice(0, 3) === name);
}

export { WEEKDAY_NAMES, MONTH_NAMES };

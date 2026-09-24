import type { Reminder, RepeatInterval, Task } from '../types';

/** What the OS should have pending. Deliberately plain data so it can be diffed and tested. */
export type PlannedNotification = {
  id: number;
  taskId: string;
  title: string;
  body: string;
  at: string;
  repeat: RepeatInterval;
};

export const SNOOZE_MINUTES = 10;

/**
 * Android notification ids must be 32-bit ints, but task ids are UUIDs. FNV-1a
 * gives a stable mapping, so the same task always owns the same alarm and can be
 * cancelled later without storing a side table.
 */
export function notificationId(taskId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < taskId.length; i += 1) {
    hash ^= taskId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Mask to 31 bits: Android rejects negative ids, and 0 is a valid-but-confusing id.
  return (hash & 0x7fffffff) || 1;
}

/**
 * Capacitor's `every` vocabulary. Typed as the literal union rather than string so
 * it lines up with the plugin's ScheduleEvery without importing native code here.
 */
export type RepeatEvery = 'day' | 'week' | 'month' | 'year';

const EVERY: Record<Exclude<RepeatInterval, 'none'>, RepeatEvery> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

export function repeatEvery(repeat: RepeatInterval): RepeatEvery | undefined {
  return repeat === 'none' ? undefined : EVERY[repeat];
}

export const REPEAT_LABELS: Record<RepeatInterval, string> = {
  none: 'Once',
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  year: 'Yearly',
};

function addInterval(date: Date, repeat: Exclude<RepeatInterval, 'none'>): Date {
  const next = new Date(date);
  switch (repeat) {
    case 'day':
      next.setDate(next.getDate() + 1);
      break;
    case 'week':
      next.setDate(next.getDate() + 7);
      break;
    case 'month':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'year':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

/**
 * When a reminder will next fire, for display only — the OS owns actual recurrence.
 * A repeating anchor in the past rolls forward to the next future occurrence.
 */
export function nextOccurrence(reminder: Reminder, now: Date = new Date()): Date | null {
  const anchor = new Date(reminder.at);
  if (Number.isNaN(anchor.getTime())) return null;
  // Anything still ahead fires as-is, repeating or not.
  if (anchor > now) return anchor;
  // A one-off whose moment has passed is spent — never fire it late.
  if (reminder.repeat === 'none') return null;

  let next = anchor;
  // Cap the walk so a decade-old daily anchor can't spin here.
  for (let i = 0; i < 4000 && next <= now; i += 1) {
    next = addInterval(next, reminder.repeat);
  }
  return next > now ? next : null;
}

/**
 * The exact set of notifications that should be pending right now — pure, so the
 * scheduling rules can be tested without a device.
 *
 * A done task never nags. A one-off whose moment has passed is dropped rather than
 * fired late. A repeating reminder stays scheduled however old its anchor is.
 */
export function planNotifications(tasks: Task[], now: Date = new Date()): PlannedNotification[] {
  const planned: PlannedNotification[] = [];

  for (const task of tasks) {
    const { reminder } = task;
    if (!reminder || task.done) continue;

    const fireAt = nextOccurrence(reminder, now);
    if (!fireAt) continue;

    planned.push({
      id: notificationId(task.id),
      taskId: task.id,
      title: task.title,
      body: task.notes.trim() || 'Reminder',
      at: fireAt.toISOString(),
      repeat: reminder.repeat,
    });
  }

  return planned;
}

/** Shift a reminder forward by the snooze window, keeping its repeat setting. */
export function snoozedReminder(reminder: Reminder, now: Date = new Date()): Reminder {
  return {
    at: new Date(now.getTime() + SNOOZE_MINUTES * 60_000).toISOString(),
    repeat: reminder.repeat,
  };
}

/** "09:00", "Tue 09:00", "12 Mar 09:00" — scaled to how far away it is. */
export function formatReminder(reminder: Reminder, now: Date = new Date()): string {
  const fireAt = nextOccurrence(reminder, now);
  if (!fireAt) return '';

  const time = fireAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay = fireAt.toDateString() === now.toDateString();
  if (sameDay) return time;

  const days = Math.round((fireAt.getTime() - now.getTime()) / 86_400_000);
  if (days >= 0 && days < 7) {
    return `${fireAt.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  }
  return `${fireAt.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

/** An ISO timestamp suitable for a `datetime-local` input (local clock, no zone). */
export function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Parse a `datetime-local` value back to an ISO timestamp, or null if unusable. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

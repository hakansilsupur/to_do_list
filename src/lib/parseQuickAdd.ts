import type { List, Priority, Reminder, RepeatInterval } from '../types';
import {
  addDays,
  fromISODate,
  monthIndex,
  nextWeekday,
  toISODate,
  todayISO,
  WEEKDAY_NAMES,
} from './dates';

export type ParsedInput = {
  title: string;
  dueDate: string | null;
  reminder: Reminder | null;
  priority: Priority;
  listId: string | null;
};

/** What the add bar's tappable controls are currently set to. */
export type QuickAddDraft = {
  dueDate: string | null;
  priority: Priority;
};

export const EMPTY_DRAFT: QuickAddDraft = { dueDate: null, priority: 'none' };

/**
 * Combine what was typed with what was tapped.
 *
 * Typed wins. The title is visible and self-describing — if "today" is sitting
 * in the text, the task is due today whatever was tapped beforehand. The chips
 * fill in only the fields the text left unspecified, and the UI highlights this
 * merged result rather than the raw selection, so the two never contradict.
 */
export function mergeQuickAdd(parsed: ParsedInput, draft: QuickAddDraft): ParsedInput {
  return {
    ...parsed,
    dueDate: parsed.dueDate ?? draft.dueDate,
    priority: parsed.priority !== 'none' ? parsed.priority : draft.priority,
  };
}

const WEEKDAY_PATTERN = WEEKDAY_NAMES.map((d) => `${d}|${d.slice(0, 3)}`).join('|');
const MONTH_PATTERN =
  'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|' +
  'august|aug|september|sep|sept|october|oct|november|nov|december|dec';

/** Resolve a bare month/day to the next such date, rolling into next year if already past. */
function monthDayToISO(month: number, day: number): string | null {
  if (month < 0 || day < 1 || day > 31) return null;
  const now = new Date();
  let candidate = new Date(now.getFullYear(), month, day);
  // Guard against overflow like "feb 31", which JS silently rolls into March.
  if (candidate.getMonth() !== month) return null;
  if (toISODate(candidate) < todayISO()) {
    candidate = new Date(now.getFullYear() + 1, month, day);
  }
  return toISODate(candidate);
}

type DateRule = {
  pattern: RegExp;
  resolve: (match: RegExpMatchArray) => string | null;
};

/**
 * Ordered longest-phrase-first so "next monday" wins over a bare "monday" and
 * "next week" is never mistaken for a weekday.
 */
const DATE_RULES: DateRule[] = [
  { pattern: /\bnext week\b/i, resolve: () => addDays(todayISO(), 7) },
  { pattern: /\bnext month\b/i, resolve: () => addDays(todayISO(), 30) },
  {
    pattern: new RegExp(`\\bnext (${WEEKDAY_PATTERN})\\b`, 'i'),
    resolve: (m) => resolveWeekday(m[1]),
  },
  {
    pattern: /\bin (\d+) (day|days|week|weeks)\b/i,
    resolve: (m) => {
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n < 0) return null;
      return addDays(todayISO(), m[2].startsWith('week') ? n * 7 : n);
    },
  },
  { pattern: /\b(today|tonight)\b/i, resolve: () => todayISO() },
  { pattern: /\b(tomorrow|tmrw?)\b/i, resolve: () => addDays(todayISO(), 1) },
  { pattern: /\byesterday\b/i, resolve: () => addDays(todayISO(), -1) },
  {
    pattern: new RegExp(`\\b(${MONTH_PATTERN}) (\\d{1,2})\\b`, 'i'),
    resolve: (m) => monthDayToISO(monthIndex(m[1].toLowerCase()), Number(m[2])),
  },
  {
    pattern: new RegExp(`\\b(\\d{1,2}) (${MONTH_PATTERN})\\b`, 'i'),
    resolve: (m) => monthDayToISO(monthIndex(m[2].toLowerCase()), Number(m[1])),
  },
  {
    pattern: new RegExp(`\\b(${WEEKDAY_PATTERN})\\b`, 'i'),
    resolve: (m) => resolveWeekday(m[1]),
  },
  {
    pattern: /\b(\d{4}-\d{2}-\d{2})\b/,
    resolve: (m) => {
      const date = fromISODate(m[1]);
      return Number.isNaN(date.getTime()) ? null : m[1];
    },
  },
];

function resolveWeekday(token: string): string | null {
  const lower = token.toLowerCase();
  const full = WEEKDAY_NAMES.find((d) => d === lower || d.slice(0, 3) === lower);
  return full ? nextWeekday(full) : null;
}

const PRIORITY_RULES: { pattern: RegExp; value: Priority }[] = [
  { pattern: /(^|\s)!(high|h)\b/i, value: 'high' },
  { pattern: /(^|\s)!(medium|med|m)\b/i, value: 'medium' },
  { pattern: /(^|\s)!(low|l)\b/i, value: 'low' },
  { pattern: /(^|\s)!!!(?=\s|$)/, value: 'high' },
  { pattern: /(^|\s)!!(?=\s|$)/, value: 'medium' },
  { pattern: /(^|\s)!(?=\s|$)/, value: 'low' },
];

type TimeOfDay = { hours: number; minutes: number };

/**
 * Times are matched after the date rules have already taken their bite, so
 * "tomorrow at 9am" composes and a yyyy-mm-dd date can't be mistaken for a clock
 * reading. Bare-number forms need either a separator or am/pm to match, which
 * keeps "Pay invoice 2" from becoming a 2 o'clock reminder.
 */
const TIME_RULES: { pattern: RegExp; resolve: (m: RegExpMatchArray) => TimeOfDay | null }[] = [
  { pattern: /\bnoon\b/i, resolve: () => ({ hours: 12, minutes: 0 }) },
  { pattern: /\bmidnight\b/i, resolve: () => ({ hours: 0, minutes: 0 }) },
  {
    pattern: /\b(?:at\s+)?(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i,
    resolve: (m) => toTime(Number(m[1]), Number(m[2]), m[3]),
  },
  {
    pattern: /\b(?:at\s+)?(\d{1,2})\s*(am|pm)\b/i,
    resolve: (m) => toTime(Number(m[1]), 0, m[2]),
  },
  { pattern: /\bat\s+(\d{1,2})\b/i, resolve: (m) => toTime(Number(m[1]), 0, undefined) },
];

function toTime(hours: number, minutes: number, meridiem: string | undefined): TimeOfDay | null {
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  let h = hours;
  if (meridiem) {
    const pm = meridiem.toLowerCase() === 'pm';
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (pm ? 12 : 0);
  } else if (h < 0 || h > 23) {
    return null;
  }
  return { hours: h, minutes };
}

/**
 * Repeats are consumed before the date rules so "every monday" is read as a weekly
 * recurrence rather than a one-off next Monday. An anchor day comes back with it.
 */
const REPEAT_RULES: {
  pattern: RegExp;
  repeat: RepeatInterval;
  anchor?: (m: RegExpMatchArray) => string | null;
}[] = [
  {
    pattern: new RegExp(`\\bevery (${WEEKDAY_PATTERN})\\b`, 'i'),
    repeat: 'week',
    anchor: (m) => {
      const lower = m[1].toLowerCase();
      const full = WEEKDAY_NAMES.find((d) => d === lower || d.slice(0, 3) === lower);
      return full ? nextWeekday(full) : null;
    },
  },
  { pattern: /\b(every ?day|daily)\b/i, repeat: 'day' },
  { pattern: /\b(every week|weekly)\b/i, repeat: 'week' },
  { pattern: /\b(every month|monthly)\b/i, repeat: 'month' },
  { pattern: /\b(every year|yearly|annually)\b/i, repeat: 'year' },
];

/** Default o'clock for a reminder that names a recurrence but no time. */
const DEFAULT_REMINDER_TIME: TimeOfDay = { hours: 9, minutes: 0 };
/** "tonight" means the evening, not 00:00. */
const TONIGHT: TimeOfDay = { hours: 20, minutes: 0 };

function cut(text: string, match: RegExpMatchArray): string {
  return text.slice(0, match.index).concat(text.slice(match.index! + match[0].length));
}

/**
 * Pull structured fields out of a quick-add line and return the leftover text as
 * the title. Anything that doesn't match a rule is left in place verbatim, so
 * "Email Mark about Friday's deck" keeps its words even though it mentions a day
 * — only the *last* standalone token is eligible, matching how people trail
 * scheduling words onto the end of a phrase.
 */
export function parseQuickAdd(raw: string, lists: List[]): ParsedInput {
  let text = raw;
  let dueDate: string | null = null;
  let priority: Priority = 'none';
  let listId: string | null = null;
  let repeat: RepeatInterval = 'none';
  let repeatAnchor: string | null = null;
  let time: TimeOfDay | null = null;

  // "tonight" doubles as a date and an hour, and the date rules eat it below.
  const saysTonight = /\btonight\b/i.test(text);

  for (const { pattern, value } of PRIORITY_RULES) {
    const match = text.match(pattern);
    if (match) {
      priority = value;
      text = text.slice(0, match.index).concat(text.slice(match.index! + match[0].length));
      break;
    }
  }

  const tagMatch = text.match(/(^|\s)#([\p{L}\p{N}_-]+)/u);
  if (tagMatch) {
    const name = tagMatch[2].toLowerCase();
    const list = lists.find((l) => l.name.toLowerCase().replace(/\s+/g, '') === name);
    if (list) {
      listId = list.id;
      text = text
        .slice(0, tagMatch.index)
        .concat(text.slice(tagMatch.index! + tagMatch[0].length));
    }
  }

  for (const rule of REPEAT_RULES) {
    const match = text.match(rule.pattern);
    if (!match || match.index === undefined) continue;
    repeat = rule.repeat;
    repeatAnchor = rule.anchor?.(match) ?? null;
    text = cut(text, match);
    break;
  }

  for (const { pattern, resolve } of DATE_RULES) {
    const match = text.match(pattern);
    if (!match || match.index === undefined) continue;
    const resolved = resolve(match);
    if (!resolved) continue;
    dueDate = resolved;
    text = cut(text, match);
    break;
  }

  for (const { pattern, resolve } of TIME_RULES) {
    const match = text.match(pattern);
    if (!match || match.index === undefined) continue;
    const resolved = resolve(match);
    if (!resolved) continue;
    time = resolved;
    text = cut(text, match);
    break;
  }

  if (!dueDate && repeatAnchor) dueDate = repeatAnchor;
  if (!time && saysTonight) time = TONIGHT;

  const reminder = buildReminder({ dueDate, time, repeat });
  // A recurrence needs a day to hang off, so surface it as the due date too.
  if (!dueDate && reminder) dueDate = reminder.at.slice(0, 10);

  // Trim connector words the date phrase left dangling: "Call mom on tuesday".
  const title = text
    .replace(/\s+/g, ' ')
    .replace(/\s+(on|by|at|due|every)\s*$/i, '')
    .trim();

  return { title, dueDate, reminder, priority, listId };
}

function buildReminder(input: {
  dueDate: string | null;
  time: TimeOfDay | null;
  repeat: RepeatInterval;
}): Reminder | null {
  const { dueDate, time, repeat } = input;
  // Only an explicit time or a recurrence means "tell me" — a bare date does not.
  if (!time && repeat === 'none') return null;

  const clock = time ?? DEFAULT_REMINDER_TIME;
  const base = dueDate ? fromISODate(dueDate) : fromISODate(todayISO());
  base.setHours(clock.hours, clock.minutes, 0, 0);

  // A time with no date that has already gone by today means tomorrow.
  if (!dueDate && base.getTime() <= Date.now()) {
    base.setDate(base.getDate() + 1);
  }

  return { at: base.toISOString(), repeat };
}

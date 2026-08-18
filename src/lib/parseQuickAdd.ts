import type { List, Priority } from '../types';
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
  priority: Priority;
  listId: string | null;
};

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

  for (const { pattern, resolve } of DATE_RULES) {
    const match = text.match(pattern);
    if (!match || match.index === undefined) continue;
    const resolved = resolve(match);
    if (!resolved) continue;
    dueDate = resolved;
    text = text.slice(0, match.index).concat(text.slice(match.index + match[0].length));
    break;
  }

  // Trim connector words the date phrase left dangling: "Call mom on tuesday".
  const title = text
    .replace(/\s+/g, ' ')
    .replace(/\s+(on|by|at|due)\s*$/i, '')
    .trim();

  return { title, dueDate, priority, listId };
}

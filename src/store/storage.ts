import type { AppState, List, Priority, Reminder, RepeatInterval, Subtask, Task } from '../types';
import { createSeedState, INBOX_LIST_ID } from './seed';

export const SCHEMA_VERSION = 1;
const STORAGE_KEY = `todo:v${SCHEMA_VERSION}:state`;

const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high'];
const REPEATS: RepeatInterval[] = ['none', 'day', 'week', 'month', 'year'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function coerceSubtask(raw: unknown): Subtask | null {
  if (!isRecord(raw)) return null;
  const title = asString(raw.title);
  if (!title) return null;
  return {
    id: asString(raw.id) || crypto.randomUUID(),
    title,
    done: raw.done === true,
  };
}

/**
 * Reminders arrived after the first release, so state written by an older build
 * simply has no `reminder` key — that reads as null here rather than as corrupt
 * data, which is why the storage key stays at v1 instead of orphaning real tasks.
 */
function coerceReminder(raw: unknown): Reminder | null {
  if (!isRecord(raw)) return null;
  const at = asString(raw.at);
  if (!at || Number.isNaN(new Date(at).getTime())) return null;
  const repeat = raw.repeat;
  return {
    at,
    repeat: REPEATS.includes(repeat as RepeatInterval) ? (repeat as RepeatInterval) : 'none',
  };
}

function coerceList(raw: unknown): List | null {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name);
  if (!name) return null;
  return {
    id: asString(raw.id) || crypto.randomUUID(),
    name,
    color: asString(raw.color, '#3d7bfb'),
  };
}

function coerceTask(raw: unknown, knownListIds: Set<string>): Task | null {
  if (!isRecord(raw)) return null;
  const title = asString(raw.title);
  if (!title) return null;

  const priority = raw.priority;
  const listId = asString(raw.listId);
  const dueDate = asString(raw.dueDate);

  return {
    id: asString(raw.id) || crypto.randomUUID(),
    title,
    notes: asString(raw.notes),
    done: raw.done === true,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null,
    reminder: coerceReminder(raw.reminder),
    priority: PRIORITIES.includes(priority as Priority) ? (priority as Priority) : 'none',
    listId: knownListIds.has(listId) ? listId : INBOX_LIST_ID,
    subtasks: Array.isArray(raw.subtasks)
      ? raw.subtasks.map(coerceSubtask).filter((s): s is Subtask => s !== null)
      : [],
    createdAt: asString(raw.createdAt, new Date().toISOString()),
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : null,
  };
}

/**
 * Read persisted state, validating field by field. Anything corrupt or
 * hand-edited falls back to seed data rather than crashing the app on boot.
 */
export function loadState(): AppState {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private mode, disabled cookies) — run in memory.
    return createSeedState();
  }

  if (!stored) return createSeedState();

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed)) return createSeedState();

    const lists = Array.isArray(parsed.lists)
      ? parsed.lists.map(coerceList).filter((l): l is List => l !== null)
      : [];
    if (lists.length === 0) return createSeedState();

    const listIds = new Set(lists.map((l) => l.id));
    // Tasks fall back to INBOX_LIST_ID, so it must exist for orphans to land somewhere.
    if (!listIds.has(INBOX_LIST_ID)) {
      lists.unshift({ id: INBOX_LIST_ID, name: 'Personal', color: '#3d7bfb' });
      listIds.add(INBOX_LIST_ID);
    }

    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.map((t) => coerceTask(t, listIds)).filter((t): t is Task => t !== null)
      : [];

    return { lists, tasks };
  } catch {
    return createSeedState();
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage unavailable — the session still works in memory.
  }
}

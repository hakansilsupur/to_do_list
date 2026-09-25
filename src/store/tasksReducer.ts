import type { AppState, List, Priority, Reminder, Task } from '../types';
import { INBOX_LIST_ID } from './seed';

export type Action =
  | { type: 'add-task'; task: Task }
  | { type: 'restore-task'; task: Task; index: number }
  | { type: 'toggle-task'; id: string }
  | { type: 'update-task'; id: string; patch: Partial<Omit<Task, 'id'>> }
  | { type: 'delete-task'; id: string }
  | { type: 'clear-completed' }
  | { type: 'add-subtask'; taskId: string; title: string; subtaskId: string }
  | { type: 'toggle-subtask'; taskId: string; subtaskId: string }
  | { type: 'delete-subtask'; taskId: string; subtaskId: string }
  | { type: 'add-list'; list: List }
  | { type: 'rename-list'; id: string; name: string }
  | { type: 'delete-list'; id: string }
  /** Restoring a backup: wholesale replacement, already validated by parseState. */
  | { type: 'replace-state'; state: AppState };

function mapTask(state: AppState, id: string, fn: (task: Task) => Task): AppState {
  let changed = false;
  const tasks = state.tasks.map((task) => {
    if (task.id !== id) return task;
    changed = true;
    return fn(task);
  });
  return changed ? { ...state, tasks } : state;
}

export function tasksReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'add-task':
      return { ...state, tasks: [action.task, ...state.tasks] };

    case 'restore-task': {
      const tasks = state.tasks.slice();
      tasks.splice(Math.min(action.index, tasks.length), 0, action.task);
      return { ...state, tasks };
    }

    case 'toggle-task':
      return mapTask(state, action.id, (task) => ({
        ...task,
        done: !task.done,
        completedAt: task.done ? null : new Date().toISOString(),
      }));

    case 'update-task':
      return mapTask(state, action.id, (task) => ({ ...task, ...action.patch }));

    case 'delete-task':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) };

    case 'clear-completed':
      return { ...state, tasks: state.tasks.filter((t) => !t.done) };

    case 'add-subtask':
      return mapTask(state, action.taskId, (task) => ({
        ...task,
        subtasks: [
          ...task.subtasks,
          { id: action.subtaskId, title: action.title, done: false },
        ],
      }));

    case 'toggle-subtask':
      return mapTask(state, action.taskId, (task) => ({
        ...task,
        subtasks: task.subtasks.map((sub) =>
          sub.id === action.subtaskId ? { ...sub, done: !sub.done } : sub,
        ),
      }));

    case 'delete-subtask':
      return mapTask(state, action.taskId, (task) => ({
        ...task,
        subtasks: task.subtasks.filter((sub) => sub.id !== action.subtaskId),
      }));

    case 'add-list':
      return { ...state, lists: [...state.lists, action.list] };

    case 'rename-list': {
      const name = action.name.trim();
      if (!name) return state;
      return {
        ...state,
        lists: state.lists.map((l) => (l.id === action.id ? { ...l, name } : l)),
      };
    }

    case 'delete-list': {
      // The inbox is the fallback home for orphaned tasks, so it can't be removed.
      if (action.id === INBOX_LIST_ID) return state;
      return {
        lists: state.lists.filter((l) => l.id !== action.id),
        tasks: state.tasks.map((t) =>
          t.listId === action.id ? { ...t, listId: INBOX_LIST_ID } : t,
        ),
      };
    }

    case 'replace-state':
      return action.state;

    default:
      return state;
  }
}

export function createTask(fields: {
  title: string;
  dueDate?: string | null;
  reminder?: Reminder | null;
  priority?: Priority;
  listId?: string;
}): Task {
  return {
    id: crypto.randomUUID(),
    title: fields.title,
    notes: '',
    done: false,
    dueDate: fields.dueDate ?? null,
    reminder: fields.reminder ?? null,
    priority: fields.priority ?? 'none',
    listId: fields.listId ?? INBOX_LIST_ID,
    subtasks: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
}

const LIST_COLORS = ['#3d7bfb', '#f0973f', '#e5484d', '#30a46c', '#8e4ec6', '#0891b2'];

export function createList(name: string, existing: List[]): List {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    color: LIST_COLORS[existing.length % LIST_COLORS.length],
  };
}

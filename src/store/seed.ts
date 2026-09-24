import type { AppState, Task } from '../types';
import { addDays, todayISO } from '../lib/dates';

export const INBOX_LIST_ID = 'list-personal';

let seedCounter = 0;
function seedId(prefix: string): string {
  seedCounter += 1;
  return `${prefix}-seed-${seedCounter}`;
}

function task(partial: Partial<Task> & Pick<Task, 'title'>): Task {
  return {
    id: seedId('task'),
    notes: '',
    done: false,
    dueDate: null,
    reminder: null,
    priority: 'none',
    listId: INBOX_LIST_ID,
    subtasks: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
    ...partial,
  };
}

/** First-run content, so the app opens with a legible layout instead of blank space. */
export function createSeedState(): AppState {
  const today = todayISO();
  return {
    lists: [
      { id: INBOX_LIST_ID, name: 'Personal', color: '#3d7bfb' },
      { id: 'list-work', name: 'Work', color: '#f0973f' },
    ],
    tasks: [
      task({
        title: 'Renew gym membership',
        dueDate: addDays(today, -1),
        priority: 'medium',
      }),
      task({
        title: 'Buy groceries for the week',
        dueDate: today,
        priority: 'high',
        notes: 'Oat milk, coffee beans, something green.',
        subtasks: [
          { id: seedId('sub'), title: 'Check what is left in the fridge', done: true },
          { id: seedId('sub'), title: 'Stop by the bakery', done: false },
        ],
      }),
      task({
        title: 'Reply to Dana about the timeline',
        dueDate: today,
        listId: 'list-work',
        priority: 'high',
      }),
      task({
        title: 'Draft the Q3 retrospective',
        dueDate: addDays(today, 1),
        listId: 'list-work',
      }),
      task({
        title: 'Book dentist appointment',
        dueDate: addDays(today, 4),
        priority: 'low',
      }),
      task({
        title: 'Read the article on sleep debt',
      }),
      task({
        title: 'Water the plants',
        dueDate: today,
        done: true,
        completedAt: new Date().toISOString(),
      }),
    ],
  };
}

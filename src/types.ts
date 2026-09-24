export type Priority = 'none' | 'low' | 'medium' | 'high';

/** How often a reminder repeats. 'none' fires once. */
export type RepeatInterval = 'none' | 'day' | 'week' | 'month' | 'year';

export type Reminder = {
  /**
   * Full ISO timestamp. For a one-off this is the fire time; when repeating it
   * is the anchor the OS counts intervals from.
   */
  at: string;
  repeat: RepeatInterval;
};

export type Subtask = {
  id: string;
  title: string;
  done: boolean;
};

export type Task = {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  /** ISO yyyy-mm-dd, or null for "Someday". */
  dueDate: string | null;
  /** Separate from dueDate: the date says when it's due, this says when to be told. */
  reminder: Reminder | null;
  priority: Priority;
  listId: string;
  subtasks: Subtask[];
  createdAt: string;
  completedAt: string | null;
};

export type List = {
  id: string;
  name: string;
  color: string;
};

/** Time buckets, derived from dueDate — never stored on the task. */
export type Bucket = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'later' | 'someday';

/** Which set of tasks the main pane is showing. */
export type View =
  | { kind: 'all' }
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'done' }
  | { kind: 'list'; listId: string };

export type AppState = {
  tasks: Task[];
  lists: List[];
};

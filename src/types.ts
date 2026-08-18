export type Priority = 'none' | 'low' | 'medium' | 'high';

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

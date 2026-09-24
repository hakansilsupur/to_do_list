import { useEffect, useRef, useState } from 'react';
import type { List, Task } from '../types';
import { formatDueLabel, isOverdue } from '../lib/dates';
import { formatReminder } from '../lib/reminders';
import { Checkbox } from './Checkbox';

const EXIT_MS = 320;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type TaskItemProps = {
  task: Task;
  list: List | undefined;
  isSelected: boolean;
  showListChip: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
};

export function TaskItem({
  task,
  list,
  isSelected,
  showListChip,
  onToggle,
  onOpen,
  onDelete,
}: TaskItemProps) {
  const [isLeaving, setIsLeaving] = useState(false);
  const pending = useRef<number | null>(null);
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  // If the row unmounts mid-animation, commit the toggle anyway — a checked box
  // that silently un-checks itself is worse than a skipped animation.
  useEffect(
    () => () => {
      if (pending.current !== null) {
        window.clearTimeout(pending.current);
        pending.current = null;
        onToggleRef.current();
      }
    },
    [],
  );

  function handleToggle() {
    if (pending.current !== null) return;
    if (prefersReducedMotion()) {
      onToggle();
      return;
    }
    setIsLeaving(true);
    pending.current = window.setTimeout(() => {
      pending.current = null;
      onToggleRef.current();
    }, EXIT_MS);
  }

  const overdue = isOverdue(task.dueDate, task.done);
  const dueLabel = formatDueLabel(task.dueDate);
  const openSubtasks = task.subtasks.filter((s) => s.done).length;
  const reminderLabel = task.reminder ? formatReminder(task.reminder) : '';

  return (
    <li
      className={[
        'task',
        task.done ? 'is-done' : '',
        isLeaving ? 'is-leaving' : '',
        isSelected ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Checkbox
        checked={task.done !== isLeaving}
        onChange={handleToggle}
        label={task.done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`}
        accent={list?.color}
      />

      <button type="button" className="task__body" onClick={onOpen}>
        <span className="task__title">{task.title}</span>
        <span className="task__meta">
          {task.priority !== 'none' && (
            <span
              className={`priority-dot priority-dot--${task.priority}`}
              title={`${task.priority} priority`}
            />
          )}
          {dueLabel && (
            <span className={`chip${overdue ? ' chip--danger' : ''}`}>{dueLabel}</span>
          )}
          {reminderLabel && (
            <span
              className="chip chip--reminder"
              title={
                task.reminder!.repeat === 'none'
                  ? `Reminder at ${reminderLabel}`
                  : `Repeating reminder, next at ${reminderLabel}`
              }
            >
              <span aria-hidden="true">🔔</span>
              {reminderLabel}
              {task.reminder!.repeat !== 'none' && <span aria-hidden="true">↻</span>}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span className="chip chip--quiet">
              {openSubtasks}/{task.subtasks.length}
            </span>
          )}
          {task.notes.trim() && (
            <span className="chip chip--quiet chip--notes" title="Has notes">
              ≡
            </span>
          )}
          {showListChip && list && (
            <span className="chip chip--list">
              <span className="chip__dot" style={{ background: list.color }} />
              {list.name}
            </span>
          )}
        </span>
      </button>

      <button
        type="button"
        className="task__delete"
        aria-label={`Delete "${task.title}"`}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8l.7-8.2" />
        </svg>
      </button>
    </li>
  );
}

import { useEffect, useState } from 'react';
import type { List, Priority, Reminder, RepeatInterval, Task } from '../types';
import { addDays, formatDueLong, toISODate, todayISO } from '../lib/dates';
import {
  formatReminder,
  fromDateTimeLocal,
  REPEAT_LABELS,
  toDateTimeLocal,
} from '../lib/reminders';
import { Checkbox } from './Checkbox';

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const REPEAT_OPTIONS: RepeatInterval[] = ['none', 'day', 'week', 'month', 'year'];

/** Build a reminder at a wall-clock time relative to today. */
function atTime(daysAhead: number, hours: number, repeat: RepeatInterval): Reminder {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hours, 0, 0, 0);
  return { at: date.toISOString(), repeat };
}

function inAnHour(repeat: RepeatInterval): Reminder {
  return { at: new Date(Date.now() + 3_600_000).toISOString(), repeat };
}

type TaskDetailProps = {
  task: Task;
  lists: List[];
  /** Null on web, where nothing can fire with the tab closed. */
  reminderSupport: ReminderSupport | null;
  onClose: () => void;
  onPatch: (patch: Partial<Omit<Task, 'id'>>) => void;
  onToggle: () => void;
  onDelete: () => void;
  onAddSubtask: (title: string) => void;
  onToggleSubtask: (subtaskId: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
};

export type ReminderSupport = {
  /** Android 12+ precise-alarm setting; false means delivery may drift. */
  exactAlarms: boolean;
  onRequestExactAlarms: () => void;
  /** Asks for notification permission; resolves false if the user declines. */
  onEnable: () => Promise<boolean>;
};

export function TaskDetail({
  task,
  lists,
  reminderSupport,
  onClose,
  onPatch,
  onToggle,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: TaskDetailProps) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);

  /**
   * Setting a reminder is the moment permission is worth asking for — the request
   * has obvious context here, unlike a prompt on first launch. The time is saved
   * either way so a denial doesn't silently discard what the user just picked.
   */
  async function setReminder(reminder: Reminder) {
    // A reminder needs a day to sit under, or the task hides in Someday while
    // still alerting. Quick add does the same; an existing due date is left alone,
    // since a heads-up the day before shouldn't move the deadline.
    const patch: Partial<Omit<Task, 'id'>> = { reminder };
    if (!task.dueDate) patch.dueDate = toISODate(new Date(reminder.at));

    onPatch(patch);
    if (!reminderSupport) return;
    const granted = await reminderSupport.onEnable();
    setPermissionDenied(!granted);
  }

  // Re-seed the local drafts when the drawer switches to a different task.
  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes);
    setSubtaskDraft('');
  }, [task.id, task.title, task.notes]);

  function commitTitle() {
    const next = title.trim();
    if (!next) {
      setTitle(task.title);
      return;
    }
    if (next !== task.title) onPatch({ title: next });
  }

  const today = todayISO();
  const quickDates: { label: string; value: string | null }[] = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDays(today, 1) },
    { label: 'Next week', value: addDays(today, 7) },
    { label: 'Someday', value: null },
  ];

  return (
    <aside className="detail" aria-label="Task details">
      <header className="detail__header">
        <button type="button" className="detail__close" onClick={onClose} aria-label="Close details">
          ×
        </button>
        <button type="button" className="detail__delete" onClick={onDelete}>
          Delete
        </button>
      </header>

      <div className="detail__body">
        <div className="detail__title-row">
          <Checkbox
            checked={task.done}
            onChange={onToggle}
            label={task.done ? 'Mark as not done' : 'Mark as done'}
          />
          <textarea
            className="detail__title"
            value={title}
            rows={1}
            aria-label="Task title"
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        </div>

        <section className="detail__section">
          <h3 className="detail__label">Due</h3>
          <div className="detail__chips">
            {quickDates.map((option) => (
              <button
                key={option.label}
                type="button"
                className={`pill${task.dueDate === option.value ? ' is-active' : ''}`}
                onClick={() => onPatch({ dueDate: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            className="detail__date"
            value={task.dueDate ?? ''}
            aria-label="Due date"
            onChange={(event) => onPatch({ dueDate: event.target.value || null })}
          />
          <p className="detail__hint">{formatDueLong(task.dueDate)}</p>
        </section>

        <section className="detail__section">
          <h3 className="detail__label">
            Reminder
            {task.reminder && (
              <span className="detail__progress">{formatReminder(task.reminder)}</span>
            )}
          </h3>

          <div className="detail__chips">
            {[
              { label: 'In 1 hour', build: () => inAnHour(task.reminder?.repeat ?? 'none') },
              { label: 'Tonight 8pm', build: () => atTime(0, 20, task.reminder?.repeat ?? 'none') },
              {
                label: 'Tomorrow 9am',
                build: () => atTime(1, 9, task.reminder?.repeat ?? 'none'),
              },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                className="pill"
                onClick={() => void setReminder(option.build())}
              >
                {option.label}
              </button>
            ))}
            {task.reminder && (
              <button
                type="button"
                className="pill pill--clear"
                onClick={() => onPatch({ reminder: null })}
              >
                Clear
              </button>
            )}
          </div>

          <input
            type="datetime-local"
            className="detail__date"
            value={task.reminder ? toDateTimeLocal(task.reminder.at) : ''}
            aria-label="Reminder time"
            onChange={(event) => {
              const at = fromDateTimeLocal(event.target.value);
              if (!at) {
                onPatch({ reminder: null });
                return;
              }
              void setReminder({ at, repeat: task.reminder?.repeat ?? 'none' });
            }}
          />

          {task.reminder && (
            <select
              className="detail__select"
              value={task.reminder.repeat}
              aria-label="Repeat"
              onChange={(event) =>
                onPatch({
                  reminder: { ...task.reminder!, repeat: event.target.value as RepeatInterval },
                })
              }
            >
              {REPEAT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {REPEAT_LABELS[value]}
                </option>
              ))}
            </select>
          )}

          {!reminderSupport && (
            <p className="detail__hint">
              Reminders alert on the Android app. In a browser the time is saved but
              nothing will fire.
            </p>
          )}
          {reminderSupport && permissionDenied && (
            <p className="detail__hint detail__hint--warn">
              Notifications are turned off for this app, so nothing will alert. Enable them
              in Android settings.
            </p>
          )}
          {reminderSupport && !reminderSupport.exactAlarms && task.reminder && (
            <p className="detail__hint">
              Precise alarms are off, so this may arrive a few minutes late.{' '}
              <button
                type="button"
                className="detail__link"
                onClick={reminderSupport.onRequestExactAlarms}
              >
                Allow exact timing
              </button>
            </p>
          )}
        </section>

        <section className="detail__section">
          <h3 className="detail__label">Priority</h3>
          <div className="detail__chips">
            {PRIORITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`pill${task.priority === option.value ? ' is-active' : ''}`}
                onClick={() => onPatch({ priority: option.value })}
              >
                {option.value !== 'none' && (
                  <span className={`priority-dot priority-dot--${option.value}`} />
                )}
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="detail__section">
          <h3 className="detail__label">List</h3>
          <select
            className="detail__select"
            value={task.listId}
            aria-label="List"
            onChange={(event) => onPatch({ listId: event.target.value })}
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </section>

        <section className="detail__section">
          <h3 className="detail__label">
            Subtasks
            {task.subtasks.length > 0 && (
              <span className="detail__progress">
                {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
              </span>
            )}
          </h3>
          <ul className="subtasks">
            {task.subtasks.map((subtask) => (
              <li key={subtask.id} className={`subtask${subtask.done ? ' is-done' : ''}`}>
                <Checkbox
                  checked={subtask.done}
                  onChange={() => onToggleSubtask(subtask.id)}
                  label={`Complete "${subtask.title}"`}
                  size="sm"
                />
                <span className="subtask__title">{subtask.title}</span>
                <button
                  type="button"
                  className="subtask__delete"
                  aria-label={`Delete subtask "${subtask.title}"`}
                  onClick={() => onDeleteSubtask(subtask.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = subtaskDraft.trim();
              if (!value) return;
              onAddSubtask(value);
              setSubtaskDraft('');
            }}
          >
            <input
              type="text"
              className="subtask__input"
              placeholder="+ Add subtask"
              aria-label="Add subtask"
              value={subtaskDraft}
              onChange={(event) => setSubtaskDraft(event.target.value)}
            />
          </form>
        </section>

        <section className="detail__section">
          <h3 className="detail__label">Notes</h3>
          <textarea
            className="detail__notes"
            placeholder="Add notes…"
            aria-label="Notes"
            value={notes}
            rows={5}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if (notes !== task.notes) onPatch({ notes });
            }}
          />
        </section>
      </div>
    </aside>
  );
}

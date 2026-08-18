import { useEffect, useState } from 'react';
import type { List, Priority, Task } from '../types';
import { addDays, formatDueLong, todayISO } from '../lib/dates';
import { Checkbox } from './Checkbox';

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

type TaskDetailProps = {
  task: Task;
  lists: List[];
  onClose: () => void;
  onPatch: (patch: Partial<Omit<Task, 'id'>>) => void;
  onToggle: () => void;
  onDelete: () => void;
  onAddSubtask: (title: string) => void;
  onToggleSubtask: (subtaskId: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
};

export function TaskDetail({
  task,
  lists,
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

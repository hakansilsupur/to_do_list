import { useMemo, useRef, useState, type RefObject } from 'react';
import type { List, Priority } from '../types';
import {
  EMPTY_DRAFT,
  mergeQuickAdd,
  parseQuickAdd,
  type ParsedInput,
  type QuickAddDraft,
} from '../lib/parseQuickAdd';
import { addDays, formatDueLabel, todayISO } from '../lib/dates';
import { formatReminder, REPEAT_LABELS } from '../lib/reminders';

type QuickAddProps = {
  lists: List[];
  defaultListId: string;
  inputRef: RefObject<HTMLInputElement>;
  onAdd: (parsed: ParsedInput) => void;
};

const PRIORITY_CHOICES: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
];

export function QuickAdd({ lists, defaultListId, inputRef, onAdd }: QuickAddProps) {
  const [value, setValue] = useState('');
  const [draft, setDraft] = useState<QuickAddDraft>(EMPTY_DRAFT);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // What pressing Add will actually create: typed text first, chips filling the gaps.
  const parsed = useMemo(() => parseQuickAdd(value, lists), [value, lists]);
  const effective = useMemo(() => mergeQuickAdd(parsed, draft), [parsed, draft]);

  const previewList = lists.find((l) => l.id === (effective.listId ?? defaultListId));
  const isOpen = value.trim().length > 0;

  // The pills reflect the merged result, not the raw selection — otherwise typing
  // "today" after tapping Tomorrow would leave two controls disagreeing on screen.
  const activeDate = effective.dueDate;
  const activePriority = effective.priority;

  // A date that came from the text can't be cleared by tapping; say so rather than
  // letting a tap appear to do nothing.
  const dateFromText = parsed.dueDate !== null;
  const priorityFromText = parsed.priority !== 'none';

  function setDate(next: string | null) {
    setDraft((d) => ({ ...d, dueDate: d.dueDate === next ? null : next }));
  }

  function setPriority(next: Priority) {
    setDraft((d) => ({ ...d, priority: d.priority === next ? 'none' : next }));
  }

  function submit() {
    if (!effective.title.trim()) return;
    onAdd(effective);
    setValue('');
    setDraft(EMPTY_DRAFT);
    // Keep the keyboard where it was so several tasks can be entered in a row —
    // tapping a chip moves focus off the field.
    inputRef.current?.focus();
  }

  return (
    <div className="quick-add">
      <form
        className="quick-add__field"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <span className="quick-add__plus" aria-hidden="true">
          +
        </span>
        <input
          ref={inputRef}
          type="text"
          className="quick-add__input"
          placeholder="Add a task — or type “tomorrow at 9am”"
          aria-label="Add a task"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setValue('');
              setDraft(EMPTY_DRAFT);
              event.currentTarget.blur();
            }
          }}
        />
        <button type="submit" className="quick-add__submit" disabled={!effective.title.trim()}>
          Add
        </button>
      </form>

      {isOpen && (
        <>
          <div className="quick-add__controls" role="group" aria-label="Date and priority">
            <button
              type="button"
              className={`pill${activeDate === todayISO() ? ' is-active' : ''}`}
              aria-pressed={activeDate === todayISO()}
              disabled={dateFromText}
              onClick={() => setDate(todayISO())}
            >
              Today
            </button>
            <button
              type="button"
              className={`pill${activeDate === addDays(todayISO(), 1) ? ' is-active' : ''}`}
              aria-pressed={activeDate === addDays(todayISO(), 1)}
              disabled={dateFromText}
              onClick={() => setDate(addDays(todayISO(), 1))}
            >
              Tomorrow
            </button>

            {/* The input's yyyy-mm-dd is exactly Task.dueDate's format, so no conversion. */}
            <label
              className={`pill pill--date${
                activeDate && activeDate !== todayISO() && activeDate !== addDays(todayISO(), 1)
                  ? ' is-active'
                  : ''
              }`}
            >
              <span aria-hidden="true">📅</span>
              <span className="quick-add__date-label">
                {activeDate && activeDate !== todayISO() && activeDate !== addDays(todayISO(), 1)
                  ? formatDueLabel(activeDate)
                  : 'Date'}
              </span>
              <input
                ref={dateInputRef}
                type="date"
                className="quick-add__date-input"
                aria-label="Pick a due date"
                value={dateFromText ? '' : (draft.dueDate ?? '')}
                disabled={dateFromText}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, dueDate: event.target.value || null }))
                }
              />
            </label>

            <span className="quick-add__divider" aria-hidden="true" />

            {PRIORITY_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={`pill${activePriority === choice.value ? ' is-active' : ''}`}
                aria-pressed={activePriority === choice.value}
                aria-label={`${choice.label} priority`}
                disabled={priorityFromText}
                onClick={() => setPriority(choice.value)}
              >
                <span className={`priority-dot priority-dot--${choice.value}`} />
                {choice.label}
              </button>
            ))}
          </div>

          <div className="quick-add__preview">
            <span className="quick-add__preview-title">
              {effective.title || <em>(no title yet)</em>}
            </span>
            {effective.dueDate && <span className="chip">{formatDueLabel(effective.dueDate)}</span>}
            {effective.reminder && (
              <span className="chip chip--reminder">
                <span aria-hidden="true">🔔</span>
                {formatReminder(effective.reminder)}
                {effective.reminder.repeat !== 'none' &&
                  ` · ${REPEAT_LABELS[effective.reminder.repeat]}`}
              </span>
            )}
            {effective.priority !== 'none' && (
              <span className={`chip chip--${effective.priority}`}>{effective.priority}</span>
            )}
            {previewList && (
              <span className="chip chip--list">
                <span className="chip__dot" style={{ background: previewList.color }} />
                {previewList.name}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

import { useMemo, useState, type RefObject } from 'react';
import type { List } from '../types';
import { parseQuickAdd, type ParsedInput } from '../lib/parseQuickAdd';
import { formatDueLabel } from '../lib/dates';
import { formatReminder, REPEAT_LABELS } from '../lib/reminders';

type QuickAddProps = {
  lists: List[];
  defaultListId: string;
  inputRef: RefObject<HTMLInputElement>;
  onAdd: (parsed: ParsedInput) => void;
};

export function QuickAdd({ lists, defaultListId, inputRef, onAdd }: QuickAddProps) {
  const [value, setValue] = useState('');

  // Live preview of what pressing Enter will actually create.
  const parsed = useMemo(() => parseQuickAdd(value, lists), [value, lists]);
  const previewList = lists.find((l) => l.id === (parsed.listId ?? defaultListId));
  const hasPreview = value.trim().length > 0;

  function submit() {
    if (!parsed.title.trim()) return;
    onAdd(parsed);
    setValue('');
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
          placeholder="Add a task —  try “Call the dentist tomorrow at 9am”"
          aria-label="Add a task"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setValue('');
              event.currentTarget.blur();
            }
          }}
        />
        <button type="submit" className="quick-add__submit" disabled={!parsed.title.trim()}>
          Add
        </button>
      </form>

      {hasPreview && (
        <div className="quick-add__preview">
          <span className="quick-add__preview-title">
            {parsed.title || <em>(no title yet)</em>}
          </span>
          {parsed.dueDate && <span className="chip">{formatDueLabel(parsed.dueDate)}</span>}
          {parsed.reminder && (
            <span className="chip chip--reminder">
              <span aria-hidden="true">🔔</span>
              {formatReminder(parsed.reminder)}
              {parsed.reminder.repeat !== 'none' && ` · ${REPEAT_LABELS[parsed.reminder.repeat]}`}
            </span>
          )}
          {parsed.priority !== 'none' && (
            <span className={`chip chip--${parsed.priority}`}>{parsed.priority}</span>
          )}
          {previewList && (
            <span className="chip chip--list">
              <span className="chip__dot" style={{ background: previewList.color }} />
              {previewList.name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

import type { List, Task } from '../types';
import { TaskItem } from './TaskItem';

type TaskGroupProps = {
  label: string;
  tone?: 'default' | 'danger';
  tasks: Task[];
  lists: List[];
  selectedId: string | null;
  showListChip: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
};

export function TaskGroup({
  label,
  tone = 'default',
  tasks,
  lists,
  selectedId,
  showListChip,
  collapsed = false,
  onToggleCollapse,
  onToggle,
  onOpen,
  onDelete,
}: TaskGroupProps) {
  if (tasks.length === 0) return null;

  const heading = (
    <>
      <span className={`group__label${tone === 'danger' ? ' group__label--danger' : ''}`}>
        {label}
      </span>
      <span className="group__count">{tasks.length}</span>
    </>
  );

  return (
    <section className="group">
      {onToggleCollapse ? (
        <button
          type="button"
          className="group__header group__header--button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
        >
          <span className={`group__caret${collapsed ? ' is-collapsed' : ''}`} aria-hidden="true">
            ▾
          </span>
          {heading}
        </button>
      ) : (
        <div className="group__header">{heading}</div>
      )}

      {!collapsed && (
        <ul className="task-list">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              list={lists.find((l) => l.id === task.listId)}
              isSelected={task.id === selectedId}
              showListChip={showListChip}
              onToggle={() => onToggle(task.id)}
              onOpen={() => onOpen(task.id)}
              onDelete={() => onDelete(task.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

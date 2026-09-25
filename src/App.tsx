import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bucket, Task, View } from './types';
import { useTasks } from './store/useTasks';
import { createList, createTask } from './store/tasksReducer';
import { INBOX_LIST_ID } from './store/seed';
import { BUCKET_LABELS, BUCKET_ORDER, bucketFor, daysFromToday, todayISO } from './lib/dates';
import type { ParsedInput } from './lib/parseQuickAdd';
import { useNativeShell, isNative, type BackHandler } from './lib/native';
import {
  checkExactAlarms,
  ensureNotificationPermission,
  requestExactAlarms,
  useReminders,
  type NotificationAction,
} from './lib/notifications';
import { snoozedReminder } from './lib/reminders';
import { exportBackup, readBackup } from './lib/backup';
import type { AppState } from './types';
import { QuickAdd } from './components/QuickAdd';
import { Sidebar } from './components/Sidebar';
import { TaskGroup } from './components/TaskGroup';
import { TaskDetail } from './components/TaskDetail';
import { EmptyState } from './components/EmptyState';
import { Toast } from './components/Toast';
import './styles/App.css';

const UNDO_MS = 5000;

const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 } as const;

/** Within a bucket: unfinished first, then priority, then earliest due date. */
function compareTasks(a: Task, b: Task): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priority !== 0) return priority;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  return a.createdAt < b.createdAt ? 1 : -1;
}

const VIEW_TITLES: Record<View['kind'], string> = {
  all: 'All tasks',
  today: 'Today',
  upcoming: 'Upcoming',
  done: 'Completed',
  list: '',
};

export default function App() {
  const [state, dispatch] = useTasks();
  const [view, setView] = useState<View>({ kind: 'today' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [undo, setUndo] = useState<{ task: Task; index: number } | null>(null);

  const quickAddRef = useRef<HTMLInputElement>(null);

  // Android's Back button peels off one layer at a time. Refs keep the handler
  // identity stable so the native listener isn't torn down on every keystroke,
  // while still reading current state at the moment Back is pressed.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;

  const handleBack = useCallback<BackHandler>(() => {
    if (selectedIdRef.current !== null) {
      setSelectedId(null);
      return 'handled';
    }
    if (sidebarOpenRef.current) {
      setSidebarOpen(false);
      return 'handled';
    }
    return 'exit';
  }, []);

  useNativeShell({ onBack: handleBack });

  const { tasks, lists } = state;

  // Notification buttons map onto actions the reducer already has — completing is
  // just a toggle, snoozing is a reminder patch. Reading tasks from a ref keeps the
  // handler stable so the native listener isn't re-registered on every render.
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const handleNotificationAction = useCallback((action: NotificationAction) => {
    const task = tasksRef.current.find((t) => t.id === action.taskId);
    if (!task) return;

    switch (action.kind) {
      case 'done':
        if (!task.done) dispatch({ type: 'toggle-task', id: task.id });
        break;
      case 'snooze':
        if (task.reminder) {
          dispatch({
            type: 'update-task',
            id: task.id,
            patch: { reminder: snoozedReminder(task.reminder) },
          });
        }
        break;
      case 'open':
        setSelectedId(task.id);
        break;
    }
  }, []);

  useReminders({ tasks, onAction: handleNotificationAction });

  // Restoring a backup replaces everything, so it goes through a confirmation that
  // names both counts rather than silently swapping the user's data out.
  const [pendingImport, setPendingImport] = useState<AppState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function handleExport() {
    const result = await exportBackup(state);
    setNotice(
      result.ok
        ? result.shared
          ? 'Backup ready to save'
          : `Exported ${tasks.length} task${tasks.length === 1 ? '' : 's'}`
        : 'Could not export a backup',
    );
  }

  function handleImport(text: string) {
    const imported = readBackup(text);
    if (!imported) {
      setNotice("That file isn't a Tasks backup");
      return;
    }
    setPendingImport(imported);
  }

  // Android 12+ can withhold precise alarm timing; surfaced in the detail drawer.
  const [exactAlarms, setExactAlarms] = useState(false);
  useEffect(() => {
    if (!isNative()) return;
    void checkExactAlarms().then(setExactAlarms);
  }, []);

  const reminderSupport = useMemo(
    () =>
      isNative()
        ? {
            exactAlarms,
            onRequestExactAlarms: () => void requestExactAlarms().then(setExactAlarms),
            onEnable: ensureNotificationPermission,
          }
        : null,
    [exactAlarms],
  );

  const activeList = view.kind === 'list' ? lists.find((l) => l.id === view.listId) : undefined;
  // The list you're viewing becomes the default home for new tasks.
  const defaultListId = activeList?.id ?? INBOX_LIST_ID;

  const counts = useMemo(() => {
    const byList: Record<string, number> = {};
    let all = 0;
    let today = 0;
    let upcoming = 0;
    let done = 0;

    for (const task of tasks) {
      if (task.done) {
        done += 1;
        continue;
      }
      all += 1;
      byList[task.listId] = (byList[task.listId] ?? 0) + 1;
      if (task.dueDate !== null) {
        const delta = daysFromToday(task.dueDate);
        if (delta <= 0) today += 1;
        if (delta > 0) upcoming += 1;
      }
    }
    return { all, today, upcoming, done, byList };
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (query) {
        const haystack = `${task.title} ${task.notes}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      switch (view.kind) {
        case 'all':
          return true;
        case 'done':
          return task.done;
        case 'today':
          return task.done ? false : task.dueDate !== null && daysFromToday(task.dueDate) <= 0;
        case 'upcoming':
          return task.done ? false : task.dueDate !== null && daysFromToday(task.dueDate) > 0;
        case 'list':
          return task.listId === view.listId;
        default:
          return true;
      }
    });
  }, [tasks, view, search]);

  const grouped = useMemo(() => {
    const open = new Map<Bucket, Task[]>();
    const done: Task[] = [];
    for (const task of visibleTasks) {
      if (task.done) {
        done.push(task);
        continue;
      }
      const bucket = bucketFor(task.dueDate, task.done);
      const list = open.get(bucket) ?? [];
      list.push(task);
      open.set(bucket, list);
    }
    for (const list of open.values()) list.sort(compareTasks);
    done.sort((a, b) => (a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1);
    return { open, done };
  }, [visibleTasks]);

  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null;

  // A task can vanish from under the drawer (deleted, or cleared) — close it.
  useEffect(() => {
    if (selectedId && !selectedTask) setSelectedId(null);
  }, [selectedId, selectedTask]);

  const handleDelete = useCallback(
    (id: string) => {
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1) return;
      setUndo({ task: tasks[index], index });
      dispatch({ type: 'delete-task', id });
    },
    [tasks, dispatch],
  );

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (event.key === '/' && !typing) {
        event.preventDefault();
        quickAddRef.current?.focus();
        return;
      }
      // Escape closes even from inside a field — the drawer is mostly inputs, so
      // requiring a click-out first would make the shortcut useless there.
      if (event.key === 'Escape') {
        if (typing) target?.blur();
        setSelectedId(null);
        setSidebarOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function handleAdd(parsed: ParsedInput) {
    // Adding from the Today view without saying a date means "today".
    const task = createTask({
      title: parsed.title,
      dueDate: parsed.dueDate ?? (view.kind === 'today' ? todayISO() : null),
      reminder: parsed.reminder,
      priority: parsed.priority,
      listId: parsed.listId ?? defaultListId,
    });
    dispatch({ type: 'add-task', task });
  }

  const title = activeList ? activeList.name : VIEW_TITLES[view.kind];
  const openCount = visibleTasks.filter((t) => !t.done).length;
  const hasAnything = visibleTasks.length > 0;

  return (
    <div className={`app${selectedTask ? ' has-detail' : ''}`}>
      <Sidebar
        lists={lists}
        view={view}
        counts={counts}
        isOpen={sidebarOpen}
        onSelect={setView}
        onClose={() => setSidebarOpen(false)}
        onAddList={(name) => {
          const list = createList(name, lists);
          dispatch({ type: 'add-list', list });
          setView({ kind: 'list', listId: list.id });
        }}
        onDeleteList={(id) => {
          dispatch({ type: 'delete-list', id });
          if (view.kind === 'list' && view.listId === id) setView({ kind: 'all' });
        }}
        onExport={() => void handleExport()}
        onImport={handleImport}
      />

      <main className="main">
        <header className="main__header">
          <button
            type="button"
            className="main__menu"
            aria-label="Open lists"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div className="main__heading">
            <h1>
              {activeList && (
                <span className="main__dot" style={{ background: activeList.color }} />
              )}
              {title}
            </h1>
            <p className="main__subtitle">
              {openCount === 0 ? 'Nothing left here' : `${openCount} open`}
            </p>
          </div>
          <input
            type="search"
            className="main__search"
            placeholder="Search"
            aria-label="Search tasks"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </header>

        {view.kind !== 'done' && (
          <QuickAdd
            lists={lists}
            defaultListId={defaultListId}
            inputRef={quickAddRef}
            onAdd={handleAdd}
          />
        )}

        <div className="main__scroll">
          {!hasAnything && (
            <EmptyState
              title={search ? 'No matches' : 'All clear'}
              hint={
                search
                  ? 'Try a different word.'
                  : 'Add a task above — dates and priorities are parsed as you type.'
              }
            />
          )}

          {BUCKET_ORDER.map((bucket) => (
            <TaskGroup
              key={bucket}
              label={BUCKET_LABELS[bucket]}
              tone={bucket === 'overdue' ? 'danger' : 'default'}
              tasks={grouped.open.get(bucket) ?? []}
              lists={lists}
              selectedId={selectedId}
              showListChip={view.kind !== 'list'}
              onToggle={(id) => dispatch({ type: 'toggle-task', id })}
              onOpen={setSelectedId}
              onDelete={handleDelete}
            />
          ))}

          {grouped.done.length > 0 && (
            <TaskGroup
              label="Completed"
              tasks={grouped.done}
              lists={lists}
              selectedId={selectedId}
              showListChip={view.kind !== 'list'}
              collapsed={view.kind === 'done' ? false : !showCompleted}
              onToggleCollapse={
                view.kind === 'done' ? undefined : () => setShowCompleted((v) => !v)
              }
              onToggle={(id) => dispatch({ type: 'toggle-task', id })}
              onOpen={setSelectedId}
              onDelete={handleDelete}
            />
          )}

          {grouped.done.length > 0 && (showCompleted || view.kind === 'done') && (
            <button
              type="button"
              className="clear-completed"
              onClick={() => dispatch({ type: 'clear-completed' })}
            >
              Clear completed
            </button>
          )}
        </div>
      </main>

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          lists={lists}
          reminderSupport={reminderSupport}
          onClose={() => setSelectedId(null)}
          onPatch={(patch) => dispatch({ type: 'update-task', id: selectedTask.id, patch })}
          onToggle={() => dispatch({ type: 'toggle-task', id: selectedTask.id })}
          onDelete={() => handleDelete(selectedTask.id)}
          onAddSubtask={(subtaskTitle) =>
            dispatch({
              type: 'add-subtask',
              taskId: selectedTask.id,
              title: subtaskTitle,
              subtaskId: crypto.randomUUID(),
            })
          }
          onToggleSubtask={(subtaskId) =>
            dispatch({ type: 'toggle-subtask', taskId: selectedTask.id, subtaskId })
          }
          onDeleteSubtask={(subtaskId) =>
            dispatch({ type: 'delete-subtask', taskId: selectedTask.id, subtaskId })
          }
        />
      )}

      {pendingImport && (
        <div
          className="confirm-scrim"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-confirm-title"
        >
          <div className="confirm">
            <h2 className="confirm__title" id="import-confirm-title">
              Restore this backup?
            </h2>
            <p className="confirm__body">
              This replaces your {tasks.length} task{tasks.length === 1 ? '' : 's'} with{' '}
              {pendingImport.tasks.length} from the file. It can't be undone.
            </p>
            <div className="confirm__actions">
              <button
                type="button"
                className="pill"
                onClick={() => setPendingImport(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm__confirm"
                onClick={() => {
                  dispatch({ type: 'replace-state', state: pendingImport });
                  setSelectedId(null);
                  setView({ kind: 'all' });
                  setNotice(`Restored ${pendingImport.tasks.length} tasks`);
                  setPendingImport(null);
                }}
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <Toast
          message={notice}
          actionLabel="OK"
          onAction={() => setNotice(null)}
          onDismiss={() => setNotice(null)}
        />
      )}

      {undo && (
        <Toast
          message={`Deleted “${undo.task.title}”`}
          actionLabel="Undo"
          onAction={() => {
            dispatch({ type: 'restore-task', task: undo.task, index: undo.index });
            setUndo(null);
          }}
          onDismiss={() => setUndo(null)}
        />
      )}
    </div>
  );
}

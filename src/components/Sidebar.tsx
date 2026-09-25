import { useRef, useState } from 'react';
import type { List, View } from '../types';
import { INBOX_LIST_ID } from '../store/seed';

type SidebarProps = {
  lists: List[];
  view: View;
  isOpen: boolean;
  onSelect: (view: View) => void;
  onAddList: (name: string) => void;
  onDeleteList: (id: string) => void;
  onClose: () => void;
  onExport: () => void;
  /** Receives the chosen file's text; the caller validates and confirms. */
  onImport: (text: string) => void;
  counts: {
    all: number;
    today: number;
    upcoming: number;
    done: number;
    byList: Record<string, number>;
  };
};

function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'list' && b.kind === 'list') return a.listId === b.listId;
  return true;
}

export function Sidebar({
  lists,
  view,
  isOpen,
  onSelect,
  onAddList,
  onDeleteList,
  onClose,
  onExport,
  onImport,
  counts,
}: SidebarProps) {
  const [newList, setNewList] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const smartViews: { view: View; label: string; icon: string; count: number }[] = [
    { view: { kind: 'today' }, label: 'Today', icon: '☀', count: counts.today },
    { view: { kind: 'upcoming' }, label: 'Upcoming', icon: '⌛', count: counts.upcoming },
    { view: { kind: 'all' }, label: 'All tasks', icon: '≡', count: counts.all },
    { view: { kind: 'done' }, label: 'Completed', icon: '✓', count: counts.done },
  ];

  function submitList() {
    const name = newList.trim();
    if (!name) {
      setIsAdding(false);
      return;
    }
    onAddList(name);
    setNewList('');
    setIsAdding(false);
  }

  return (
    <>
      {isOpen && <div className="sidebar-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar${isOpen ? ' is-open' : ''}`}>
        <div className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden="true">
            ✓
          </span>
          <span>Tasks</span>
        </div>

        <nav className="sidebar__section" aria-label="Views">
          {smartViews.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`nav-item${sameView(view, item.view) ? ' is-active' : ''}`}
              onClick={() => {
                onSelect(item.view);
                onClose();
              }}
            >
              <span className="nav-item__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="nav-item__label">{item.label}</span>
              {item.count > 0 && <span className="nav-item__count">{item.count}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar__section">
          <div className="sidebar__heading">Lists</div>
          {lists.map((list) => (
            <div key={list.id} className="nav-item-row">
              <button
                type="button"
                className={`nav-item${
                  view.kind === 'list' && view.listId === list.id ? ' is-active' : ''
                }`}
                onClick={() => {
                  onSelect({ kind: 'list', listId: list.id });
                  onClose();
                }}
              >
                <span className="nav-item__dot" style={{ background: list.color }} />
                <span className="nav-item__label">{list.name}</span>
                {counts.byList[list.id] > 0 && (
                  <span className="nav-item__count">{counts.byList[list.id]}</span>
                )}
              </button>
              {list.id !== INBOX_LIST_ID && (
                <button
                  type="button"
                  className="nav-item__delete"
                  aria-label={`Delete list "${list.name}"`}
                  title="Delete list (its tasks move to Personal)"
                  onClick={() => onDeleteList(list.id)}
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {isAdding ? (
            <form
              className="sidebar__new-list"
              onSubmit={(event) => {
                event.preventDefault();
                submitList();
              }}
            >
              <input
                autoFocus
                type="text"
                value={newList}
                placeholder="List name"
                aria-label="New list name"
                onChange={(event) => setNewList(event.target.value)}
                onBlur={submitList}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setNewList('');
                    setIsAdding(false);
                  }
                }}
              />
            </form>
          ) : (
            <button
              type="button"
              className="nav-item nav-item--muted"
              onClick={() => setIsAdding(true)}
            >
              <span className="nav-item__icon" aria-hidden="true">
                +
              </span>
              <span className="nav-item__label">New list</span>
            </button>
          )}
        </div>

        <div className="sidebar__section">
          <div className="sidebar__heading">Data</div>
          <button type="button" className="nav-item nav-item--muted" onClick={onExport}>
            <span className="nav-item__icon" aria-hidden="true">
              ↥
            </span>
            <span className="nav-item__label">Export backup</span>
          </button>
          <button
            type="button"
            className="nav-item nav-item--muted"
            onClick={() => fileRef.current?.click()}
          >
            <span className="nav-item__icon" aria-hidden="true">
              ↧
            </span>
            <span className="nav-item__label">Import backup</span>
          </button>
          {/* Capacitor's WebView implements onShowFileChooser, so this one element
              opens the Android picker as well as the desktop one. */}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sidebar__file-input"
            aria-label="Choose a backup file"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              // Reset first, so picking the same file twice still fires onChange.
              event.target.value = '';
              if (file) onImport(await file.text());
            }}
          />
        </div>

        <div className="sidebar__footer">
          <kbd>/</kbd> to add · <kbd>Esc</kbd> to close
        </div>
      </aside>
    </>
  );
}

type EmptyStateProps = {
  title: string;
  hint: string;
};

export function EmptyState({ title, hint }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="23" />
        <polyline points="22,32.5 29,39.5 43,25.5" />
      </svg>
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__hint">{hint}</p>
    </div>
  );
}

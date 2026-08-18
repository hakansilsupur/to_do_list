type ToastProps = {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
};

export function Toast({ message, actionLabel, onAction, onDismiss }: ToastProps) {
  return (
    <div className="toast" role="status">
      <span className="toast__message">{message}</span>
      <button type="button" className="toast__action" onClick={onAction}>
        {actionLabel}
      </button>
      <button type="button" className="toast__dismiss" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

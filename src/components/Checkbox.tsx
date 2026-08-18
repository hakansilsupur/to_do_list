type CheckboxProps = {
  checked: boolean;
  onChange: () => void;
  label: string;
  size?: 'sm' | 'md';
  accent?: string;
};

/** The rounded fill-on-check control used for both tasks and subtasks. */
export function Checkbox({ checked, onChange, label, size = 'md', accent }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`checkbox checkbox--${size}${checked ? ' is-checked' : ''}`}
      style={accent ? ({ '--checkbox-accent': accent } as React.CSSProperties) : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <polyline points="3.5,8.5 6.5,11.5 12.5,4.5" />
      </svg>
    </button>
  );
}

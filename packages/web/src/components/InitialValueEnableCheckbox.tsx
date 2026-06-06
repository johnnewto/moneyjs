import { useEffect, useRef } from "react";

export function InitialValueEnableCheckbox({
  ariaLabel,
  checked,
  className,
  indeterminate = false,
  onChange
}: {
  ariaLabel: string;
  checked: boolean;
  className?: string;
  indeterminate?: boolean;
  onChange(checked: boolean): void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      aria-label={ariaLabel}
      checked={checked}
      className={className}
      onChange={(event) => onChange(event.target.checked)}
      type="checkbox"
    />
  );
}

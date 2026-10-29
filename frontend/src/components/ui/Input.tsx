import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: string;
  /** Validation message. Replaces the hint and is announced assertively. */
  error?: string;
}

export function Input({ label, hint, error, className, id, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-11 w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink',
          'placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60',
          error ? 'border-danger' : 'border-line',
        )}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

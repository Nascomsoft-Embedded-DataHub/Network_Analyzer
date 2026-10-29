import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction without changing the button width. */
  loading?: boolean;
  leadingIcon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:opacity-90 border-transparent',
  secondary: 'bg-surface text-ink hover:bg-surface-2 border-line',
  ghost: 'bg-transparent text-ink hover:bg-surface-2 border-transparent',
  danger: 'bg-danger text-white hover:opacity-90 border-transparent',
};

/** `md` is the 44px minimum touch target; `lg` is 48px for primary actions. */
const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leadingIcon,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="" /> : leadingIcon}
      {children}
    </button>
  );
}

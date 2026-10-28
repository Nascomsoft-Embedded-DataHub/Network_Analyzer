import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type IconButtonVariant = 'secondary' | 'ghost' | 'danger';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: the icon alone carries no accessible name. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
}

const VARIANTS: Record<IconButtonVariant, string> = {
  secondary: 'bg-surface text-ink hover:bg-surface-2 border-line',
  ghost: 'bg-transparent text-ink hover:bg-surface-2 border-transparent',
  danger: 'bg-transparent text-danger hover:bg-surface-2 border-transparent',
};

/** Square 44px minimum touch target — the icon sits inside it. */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-lg border',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}

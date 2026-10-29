import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './IconButton';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Modal dialog.
 *
 * Full-width on a phone, centred from `sm` up. Escape and a backdrop click
 * both dismiss it, and focus moves into the dialog when it opens.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-line',
          'bg-surface p-4 shadow-[var(--shadow)] focus:outline-none sm:max-w-lg sm:rounded-2xl',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description !== undefined ? (
              <p className="mt-1 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
          <IconButton label="Close dialog" icon={<CloseIcon />} onClick={onClose} />
        </div>
        {children !== undefined ? <div className="mt-4">{children}</div> : null}
        {footer !== undefined ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

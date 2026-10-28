import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Content for the active tab. */
  children?: ReactNode;
  className?: string;
}

/**
 * Tab strip.
 *
 * The strip scrolls horizontally on a narrow screen rather than wrapping, so
 * the active tab stays reachable without the layout reflowing.
 */
export function Tabs({ items, value, onChange, children, className }: TabsProps) {
  const baseId = useId();

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label="Sections"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4"
      >
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium',
                'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                selected
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${value}`}
        aria-labelledby={`${baseId}-tab-${value}`}
        className="pt-4"
      >
        {children}
      </div>
    </div>
  );
}

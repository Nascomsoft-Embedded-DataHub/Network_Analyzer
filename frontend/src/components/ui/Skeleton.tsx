import { cn } from '@/lib/utils';

export interface SkeletonProps {
  className?: string;
  /** Rounds the block into a pill — for avatar and dot placeholders. */
  rounded?: boolean;
}

/**
 * Placeholder block shown while a panel loads.
 *
 * Skeletons replace stale data rather than a spinner over it: a spinner on top
 * of old numbers reads as "these are the current values".
 */
export function Skeleton({ className, rounded = false }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-surface-2',
        rounded ? 'rounded-full' : 'rounded-md',
        className ?? 'h-4 w-full',
      )}
    />
  );
}

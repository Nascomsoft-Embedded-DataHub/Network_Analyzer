export type ClassValue = string | false | null | undefined;

/** Joins conditional class names. Keeps Tailwind class strings readable. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}

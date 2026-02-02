/**
 * Tailwind CSS Utilities
 * Helper function for merging Tailwind classes with proper precedence.
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge class names with Tailwind's conflict resolution */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

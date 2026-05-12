import type { FocusEvent } from 'react';

/**
 * Select the whole value on focus so onsite users can type a new number
 * without deleting a leading 0. Deferred one frame for mobile Safari.
 */
export function selectAllOnNumberFocus(e: FocusEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  requestAnimationFrame(() => {
    el.select();
  });
}

export const numberInputQuickEntryProps = {
  onFocus: selectAllOnNumberFocus,
  inputMode: 'decimal' as const,
};

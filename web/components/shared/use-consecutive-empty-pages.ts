import { useState } from 'react'

/**
 * Native clients stop walking after this many consecutive empty pages and leave "Load more"
 * as the way to continue; web matches so a feed of nothing but filtered-out pages cannot chain
 * requests without end.
 */
export const MAX_CONSECUTIVE_EMPTY_PAGES = 5

interface EmptyPageState {
  count: number
  cursor: string | null | undefined
  resetKey: unknown
}

/**
 * Counts the pages that arrived while the list stayed empty. Every distinct cursor seen while
 * `isEmpty` is one empty page (the initial page counts), a page that adds results resets the
 * count, and so does a `resetKey` change. Counting pages rather than requests keeps an
 * in-flight request from being counted twice.
 */
export function useConsecutiveEmptyPages(
  isEmpty: boolean,
  endCursor: string | null,
  resetKey: unknown,
) {
  const [state, setState] = useState<EmptyPageState>({
    count: 0,
    cursor: undefined,
    resetKey,
  })

  // Derived during render so the count is already current when the sentinel re-observes.
  const base = Object.is(state.resetKey, resetKey)
    ? state
    : { count: 0, cursor: undefined, resetKey }
  let next = base
  if (!isEmpty) next = { count: 0, cursor: undefined, resetKey }
  else if (base.cursor !== endCursor) next = { count: base.count + 1, cursor: endCursor, resetKey }
  const changed =
    next.count !== state.count ||
    next.cursor !== state.cursor ||
    !Object.is(next.resetKey, state.resetKey)
  if (changed) setState(next)

  return {
    autoLoadPaused: () => next.count >= MAX_CONSECUTIVE_EMPTY_PAGES,
    restart: () => setState({ ...next, count: 0 }),
  }
}

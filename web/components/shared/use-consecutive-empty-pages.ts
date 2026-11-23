import { useState } from 'react'

export const MAX_CONSECUTIVE_EMPTY_PAGES = 5

interface EmptyPageState {
  count: number
  cursor: string | null
  itemCount: number
  resetKey: unknown
}

export function useConsecutiveEmptyPages(
  itemCount: number,
  endCursor: string | null,
  resetKey: unknown,
) {
  const [state, setState] = useState<EmptyPageState>({
    count: itemCount === 0 ? 1 : 0,
    cursor: endCursor,
    itemCount,
    resetKey,
  })

  // Derive during render so this page counts before the sentinel observes it.
  let count = state.count
  if (!Object.is(state.resetKey, resetKey)) {
    count = itemCount === 0 ? 1 : 0
  } else if (state.cursor !== endCursor) {
    count = itemCount > state.itemCount ? 0 : count + 1
  }

  if (
    state.itemCount !== itemCount ||
    state.cursor !== endCursor ||
    !Object.is(state.resetKey, resetKey)
  ) {
    setState({ count, cursor: endCursor, itemCount, resetKey })
  }

  return {
    autoLoadPaused: count >= MAX_CONSECUTIVE_EMPTY_PAGES,
    restart: () => setState(current => ({ ...current, count: 0 })),
  }
}

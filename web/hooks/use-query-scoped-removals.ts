'use client'

import { useCallback, useMemo, useState } from 'react'

const EMPTY_REMOVALS: ReadonlySet<string> = new Set()

export function useQueryScopedRemovals(queryKey: string) {
  const queryToken = useMemo(() => ({ queryKey }), [queryKey])
  const [state, setState] = useState<{
    queryToken: { queryKey: string }
    ids: ReadonlySet<string>
  }>(() => ({ queryToken, ids: EMPTY_REMOVALS }))

  const removedIds = state.queryToken === queryToken ? state.ids : EMPTY_REMOVALS
  const remove = useCallback(
    (id: string) => {
      setState(previous => {
        const ids = new Set(previous.queryToken === queryToken ? previous.ids : EMPTY_REMOVALS)
        ids.add(id)
        return { queryToken, ids }
      })
    },
    [queryToken],
  )

  return { remove, removedIds }
}

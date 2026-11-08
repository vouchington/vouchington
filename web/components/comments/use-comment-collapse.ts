'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { bookmarkEntity, unbookmarkEntity } from '@/lib/api/client/bookmarks'
import { getPreference, setPreference } from '@/lib/preferences/storage'
import type { Post } from '@/types/posts'

interface UseCommentCollapseOptions {
  /** Signed-in collapse is the server `hide` bookmark; signed-out collapse stays in localStorage. */
  currentUserId: string | null
  rootPostId: string
  mergedPostsMap: Record<string, Post>
  postIdsKey: string
  serverHidden: (id: string) => boolean
  onExpand: (id: string) => void
}

interface CollapseMutation {
  confirmed: boolean
  desired: boolean
  pending: boolean
  revision: number
}

export function useCommentCollapse({
  currentUserId,
  rootPostId,
  mergedPostsMap,
  postIdsKey,
  serverHidden,
  onExpand,
}: UseCommentCollapseOptions) {
  const [localIds, setLocalIds] = useState<Set<string>>(new Set())
  const scopeKey = JSON.stringify([currentUserId, rootPostId])
  const scopeRef = useRef(scopeKey)
  const [overrideState, setOverrideState] = useState({
    scope: scopeKey,
    values: {} as Record<string, boolean>,
  })
  const mutations = useRef(new Map<string, CollapseMutation>())
  useLayoutEffect(() => {
    if (scopeRef.current === scopeKey) return
    scopeRef.current = scopeKey
    mutations.current.clear()
  }, [scopeKey])
  const overrides = overrideState.scope === scopeKey ? overrideState.values : {}
  const storageKey = `comments-collapsed:${rootPostId}`
  useHydrateLocalCollapse(
    currentUserId === null,
    storageKey,
    postIdsKey,
    mergedPostsMap,
    setLocalIds,
  )

  const isCollapsed = (id: string) =>
    currentUserId === null ? localIds.has(id) : (overrides[id] ?? serverHidden(id))
  const collapsedIds = new Set(Object.keys(mergedPostsMap).filter(isCollapsed))

  function toggle(id: string) {
    const mutation = currentUserId === null ? undefined : mutations.current.get(id)
    const collapsing = !(mutation?.desired ?? isCollapsed(id))
    if (!collapsing) onExpand(id)
    if (currentUserId === null) {
      setLocalIds(prev => {
        const next = new Set(prev)
        if (collapsing) next.add(id)
        else next.delete(id)
        setPreference(storageKey, JSON.stringify([...next]))
        return next
      })
      return
    }
    const next = mutation ?? {
      confirmed: serverHidden(id),
      desired: collapsing,
      pending: false,
      revision: 0,
    }
    next.desired = collapsing
    next.revision += 1
    mutations.current.set(id, next)
    const scope = scopeKey
    setOverrideState(prev => ({
      scope,
      values: { ...(prev.scope === scope ? prev.values : {}), [id]: collapsing },
    }))
    void saveCollapse(id, next, scope)
  }

  async function saveCollapse(id: string, mutation: CollapseMutation, scope: string) {
    if (mutation.pending) return
    mutation.pending = true
    try {
      while (
        scopeRef.current === scope &&
        mutations.current.get(id) === mutation &&
        mutation.confirmed !== mutation.desired
      ) {
        const collapsing = mutation.desired
        const revision = mutation.revision
        try {
          const request = collapsing
            ? bookmarkEntity('post', id, 'hide')
            : unbookmarkEntity('post', id, 'hide')
          // eslint-disable-next-line no-await-in-loop -- The next write must wait for this comment's request.
          await request
          mutation.confirmed = collapsing
        } catch (err) {
          Sentry.captureException(err)
          if (scopeRef.current !== scope || mutations.current.get(id) !== mutation) return
          // A newer toggle owns the UI; only roll back the failed intent.
          if (mutation.revision === revision) {
            const confirmed = mutation.confirmed
            mutation.desired = confirmed
            setOverrideState(prev =>
              prev.scope === scope && prev.values[id] === collapsing
                ? { scope, values: { ...prev.values, [id]: confirmed } }
                : prev,
            )
          }
        }
      }
    } finally {
      mutation.pending = false
    }
  }

  return { collapsedIds, toggle }
}

// useLayoutEffect deps are not compiled by the React Compiler, so postIdsKey must stay stable.
function useHydrateLocalCollapse(
  enabled: boolean,
  storageKey: string,
  postIdsKey: string,
  mergedPostsMap: Record<string, Post>,
  setIds: (value: Set<string>) => void,
) {
  useLayoutEffect(() => {
    if (!enabled) return
    const pruned = parseStoredIds(getPreference(storageKey)).filter(id => id in mergedPostsMap)
    setIds(new Set(pruned))
    setPreference(storageKey, JSON.stringify(pruned))
  }, [enabled, mergedPostsMap, postIdsKey, setIds, storageKey])
}

function parseStoredIds(stored: string | null | undefined): string[] {
  if (!stored) return []
  try {
    const ids: unknown = JSON.parse(stored)
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

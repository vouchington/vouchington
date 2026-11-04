'use client'

import { useLayoutEffect, useState } from 'react'
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

export function useCommentCollapse({
  currentUserId,
  rootPostId,
  mergedPostsMap,
  postIdsKey,
  serverHidden,
  onExpand,
}: UseCommentCollapseOptions) {
  const [localIds, setLocalIds] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
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
    const collapsing = !isCollapsed(id)
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
    setOverrides(prev => ({ ...prev, [id]: collapsing }))
    const request = collapsing
      ? bookmarkEntity('post', id, 'hide')
      : unbookmarkEntity('post', id, 'hide')
    request.catch(err => {
      Sentry.captureException(err)
      setOverrides(prev => ({ ...prev, [id]: !collapsing }))
    })
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
    const ids = JSON.parse(stored)
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

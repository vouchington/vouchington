'use client'

import { useMemo } from 'react'
import { RssItemNavContext } from './rss-item-nav-context'

const noopLoadMore = () => {}

export function RssItemNavProvider({
  children,
  orderedItemIds,
  hasNextPage = false,
  loadingMore = false,
  onLoadMore = noopLoadMore,
}: {
  children: React.ReactNode
  orderedItemIds: string[]
  hasNextPage?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void | Promise<void | boolean>
}) {
  const value = useMemo(
    () => ({ orderedItemIds, hasNextPage, loadingMore, loadMore: onLoadMore }),
    [orderedItemIds, hasNextPage, loadingMore, onLoadMore],
  )
  return <RssItemNavContext.Provider value={value}>{children}</RssItemNavContext.Provider>
}

'use client'

import { createContext, use } from 'react'

export interface RssItemNavContextValue {
  orderedItemIds: string[]
  hasNextPage: boolean
  loadingMore: boolean
  loadMore: () => void | Promise<void | boolean>
}

export const RssItemNavContext = createContext<RssItemNavContextValue | null>(null)

/**
 * Returns the nav context if provided by a parent list component, or null for
 * direct URL access (no list context). Use orderedItemIds to build prev/next.
 */
export function useRssItemNav(): RssItemNavContextValue | null {
  return use(RssItemNavContext)
}

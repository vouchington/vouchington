'use client'

import type { ReactNode } from 'react'
import type { HackerNewsReferenceCounts } from '@/types/hacker-news'
import {
  EMPTY_HACKER_NEWS_REFERENCES,
  HackerNewsReferencesContext,
} from './use-hacker-news-reference-counts'

/** Counts keyed by post id or RSS feed item id, from the list response sidecars. */
export function HackerNewsReferencesProvider({
  references,
  children,
}: {
  references: Record<string, HackerNewsReferenceCounts> | undefined
  children: ReactNode
}) {
  return (
    <HackerNewsReferencesContext.Provider value={references ?? EMPTY_HACKER_NEWS_REFERENCES}>
      {children}
    </HackerNewsReferencesContext.Provider>
  )
}

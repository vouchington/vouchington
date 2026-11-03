'use client'

import { createContext, useContext } from 'react'
import type { HackerNewsReferenceCounts } from '@/types/hacker-news'

const EMPTY: Record<string, HackerNewsReferenceCounts> = {}

export const HackerNewsReferencesContext = createContext(EMPTY)

export { EMPTY as EMPTY_HACKER_NEWS_REFERENCES }

export function useHackerNewsReferenceCounts(entityId: string): HackerNewsReferenceCounts | null {
  return useContext(HackerNewsReferencesContext)[entityId] ?? null
}

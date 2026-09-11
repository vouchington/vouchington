'use client'

import { createContext, use } from 'react'
import type { FeedStyle } from './shared'

export interface FeedStyleContextValue {
  feedStyle: FeedStyle
  setFeedStyle: (feedStyle: FeedStyle) => void
}

export const FeedStyleContext = createContext<FeedStyleContextValue | null>(null)

export function useFeedStyle() {
  const context = use(FeedStyleContext)
  if (!context) throw new Error('useFeedStyle must be used within FeedStyleProvider')
  return context
}

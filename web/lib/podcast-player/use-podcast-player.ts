'use client'

import { createContext, use } from 'react'
import type { PodcastPlayerContextValue } from './types'

export const PodcastPlayerContext = createContext<PodcastPlayerContextValue | null>(null)

export function usePodcastPlayer(): PodcastPlayerContextValue {
  const context = use(PodcastPlayerContext)
  if (!context) throw new Error('usePodcastPlayer must be used within a PodcastPlayerProvider')
  return context
}

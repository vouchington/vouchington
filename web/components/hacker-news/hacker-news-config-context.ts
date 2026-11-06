'use client'

import { createContext, useContext } from 'react'
import type { HackerNewsConfig } from '@/lib/hacker-news-config'

export const HackerNewsConfigContext = createContext<HackerNewsConfig>({
  references_visible: true,
  post_time_range_cap: '1y',
})

export const HackerNewsReferenceRefreshGenerationContext = createContext(0)

export const useHackerNewsConfig = () => useContext(HackerNewsConfigContext)

export const useHackerNewsReferenceRefreshGeneration = () =>
  useContext(HackerNewsReferenceRefreshGenerationContext)

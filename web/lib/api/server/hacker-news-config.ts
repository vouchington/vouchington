import { cache } from 'react'
import { serverApi } from './instance'
import {
  HIDDEN_HACKER_NEWS_CONFIG,
  parseHackerNewsConfig,
  type HackerNewsConfig,
} from '@/lib/hacker-news-config'

export const getHackerNewsConfig = cache(async (): Promise<HackerNewsConfig> => {
  try {
    return parseHackerNewsConfig(
      await serverApi.get<HackerNewsConfig>('/api/v1/hacker-news-config'),
    )
  } catch {
    return HIDDEN_HACKER_NEWS_CONFIG
  }
})

import { cache } from 'react'
import { serverApi } from './instance'
import type { HackerNewsConfig } from '@/lib/hacker-news-config'

export const getHackerNewsConfig = cache((): Promise<HackerNewsConfig> =>
  serverApi.get<HackerNewsConfig>('/api/v1/hacker-news-config'),
)

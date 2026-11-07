'use client'

import { clientApi } from './instance'
import { parseHackerNewsConfig, type HackerNewsConfig } from '@/lib/hacker-news-config'

export async function getHackerNewsConfigClient(): Promise<HackerNewsConfig> {
  return parseHackerNewsConfig(await clientApi.get<HackerNewsConfig>('/api/v1/hacker-news-config'))
}

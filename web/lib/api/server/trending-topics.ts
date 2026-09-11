import { cache } from 'react'
import { serverApi } from './instance'
import type { TrendingTopicsResponse } from '@/types/api-responses'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getTrendingTopics = cache(
  async (options?: GetOptions): Promise<TrendingTopicsResponse> => {
    return serverApi.get<TrendingTopicsResponse>('/api/v1/trending-topics', options ?? {})
  },
)

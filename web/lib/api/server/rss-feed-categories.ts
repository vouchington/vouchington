import { cache } from 'react'
import { serverApi } from './instance'
import type { UnmappedCategoryListResponse } from '@/types/rss-feed-categories'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
}

export const getAdminRssFeedCategories = cache(
  async (options: GetOptions = {}): Promise<UnmappedCategoryListResponse> => {
    return serverApi.get<UnmappedCategoryListResponse>('/api/v1/rss-feed-categories', options)
  },
)

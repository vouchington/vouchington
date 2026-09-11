import { cache } from 'react'
import { serverApi } from './instance'
import type { CommunitiesSearchResponseBody } from '@/types/api-responses'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getTrendingCommunities = cache(
  async (options: GetOptions = {}): Promise<CommunitiesSearchResponseBody> => {
    return serverApi.get<CommunitiesSearchResponseBody>('/api/v1/communities', options)
  },
)

import { cache } from 'react'
import { serverApi } from './instance'
import type { TopicsResponseBody } from '@/types/api-responses'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getTrendingReferralPrograms = cache(
  async (options: GetOptions = {}): Promise<TopicsResponseBody> => {
    return serverApi.get<TopicsResponseBody>('/api/v1/topics', {
      ...options,
      searchParams: {
        topic_types: 'referral_program',
        sort: 'best',
        limit: 5,
        ...options.searchParams,
      },
    })
  },
)

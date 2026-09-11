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

export interface TrendingReferralProgram {
  id: string
  trending_score: number
  link_count: number
  slug?: string
  name?: string
  label?: string | null
  url?: string | null
  referral_link_count?: number | null
}

export interface TrendingReferralProgramsEndpointResponse {
  referral_programs: TrendingReferralProgram[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

export const getTrendingReferralProgramsEndpoint = cache(
  async (options: GetOptions = {}): Promise<TrendingReferralProgramsEndpointResponse> => {
    return serverApi.get<TrendingReferralProgramsEndpointResponse>(
      '/api/v1/trending-referral-programs',
      options,
    )
  },
)

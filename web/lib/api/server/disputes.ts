import { cache } from 'react'
import { serverApi } from './instance'
import type { ReviewDisputeSummary } from '@/types/review-disputes'

interface DisputesResponse {
  disputes: ReviewDisputeSummary[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

export const getReviewDisputes = cache(
  async (
    options: {
      searchParams?: { limit?: number; cursor?: string; status?: string; mine?: boolean }
    } = {},
  ): Promise<DisputesResponse> => {
    return serverApi.get<DisputesResponse>('/api/v1/disputes', options)
  },
)

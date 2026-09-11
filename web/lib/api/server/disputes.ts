import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type { ReviewDispute, PostDisputeAnnotation } from '@/types/review-disputes'

interface DisputesResponse {
  disputes: ReviewDispute[]
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

export const getPostDisputeAnnotation = cache(
  async (postId: string): Promise<PostDisputeAnnotation | null> => {
    const response = await returnNullForMissingEntity(
      serverApi.get<{ annotation: PostDisputeAnnotation | null }>(
        `/api/v1/posts/${postId}/dispute-annotation`,
      ),
    )
    return response?.annotation ?? null
  },
)

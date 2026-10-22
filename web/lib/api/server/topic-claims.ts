import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type { TopicClaim } from '@/types/topic-claims'
import type { PageInfo } from '@voucha/types/pagination'

interface TopicClaimsResponse {
  results: TopicClaim[]
  page_info: PageInfo
}

export const getMyTopicClaims = cache(
  async (options?: {
    topicIds?: readonly string[]
    verifiedOnly?: boolean
    after?: string
    limit?: number
  }): Promise<TopicClaimsResponse | null> => {
    const query = new URLSearchParams()
    if (options?.topicIds) query.set('topic_ids', options.topicIds.join(','))
    if (options?.verifiedOnly) query.set('verified_only', 'true')
    if (options?.after) query.set('after', options.after)
    if (options?.limit) query.set('limit', String(options.limit))
    const url = `/api/v1/my/topic-claims${query.size ? `?${query}` : ''}`
    return returnNullForMissingEntity(serverApi.get<TopicClaimsResponse>(url), {
      nullStatusCodes: [401, 403, 404],
    })
  },
)

export const getPendingTopicClaims = cache(async (): Promise<{ claims: TopicClaim[] }> => {
  return serverApi.get<{ claims: TopicClaim[] }>('/api/v1/admin/topic-claims')
})

export const getTopicClaims = cache(
  async (
    topicIdOrSlug: string,
    options?: { activeOnly?: boolean; mineOnly?: boolean },
  ): Promise<TopicClaimsResponse> => {
    const query = new URLSearchParams()
    if (options?.activeOnly) query.set('active_only', 'true')
    if (options?.mineOnly) query.set('mine_only', 'true')
    return serverApi.get<TopicClaimsResponse>(
      `/api/v1/topics/${encodeURIComponent(topicIdOrSlug)}/claims${query.size ? `?${query}` : ''}`,
    )
  },
)

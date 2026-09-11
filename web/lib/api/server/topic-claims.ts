import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type { TopicClaim } from '@/types/topic-claims'

interface TopicClaimsResponse {
  claims: TopicClaim[]
}

export const getMyTopicClaims = cache(async (): Promise<TopicClaimsResponse | null> =>
  returnNullForMissingEntity(serverApi.get<TopicClaimsResponse>('/api/v1/my/topic-claims'), {
    nullStatusCodes: [401, 403, 404],
  }),
)

export const getPendingTopicClaims = cache(async (): Promise<TopicClaimsResponse> => {
  return serverApi.get<TopicClaimsResponse>('/api/v1/admin/topic-claims')
})

export const getTopicClaims = cache(async (topicIdOrSlug: string): Promise<TopicClaimsResponse> => {
  return serverApi.get<TopicClaimsResponse>(`/api/v1/topics/${topicIdOrSlug}/claims`)
})

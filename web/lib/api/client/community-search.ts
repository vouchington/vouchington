'use client'
import { clientApi } from './instance'
import type { CommunitiesSearchResponseBody } from '@/types/api-responses'
import type { PostType } from '@/types/posts'

type CommunityRootPostType = Extract<PostType, 'discussion' | 'review' | 'data_point'>

export function fetchCommunities(options: {
  q?: string
  limit?: number
  eligible_post_type?: CommunityRootPostType
  signal?: AbortSignal
}): Promise<CommunitiesSearchResponseBody> {
  return clientApi.get<CommunitiesSearchResponseBody>('/api/v1/communities', {
    searchParams: {
      q: options.q,
      limit: options.limit,
      eligible_post_type: options.eligible_post_type,
    },
    signal: options.signal,
  })
}

export function searchMyCommunities(
  limit = 10,
  after?: string,
  eligiblePostType?: CommunityRootPostType,
): Promise<CommunitiesSearchResponseBody> {
  const searchParams = {
    member_id: 'me',
    limit,
    ...(after === undefined ? {} : { after }),
    ...(eligiblePostType === undefined ? {} : { eligible_post_type: eligiblePostType }),
  }
  return clientApi.get('/api/v1/communities', { searchParams })
}

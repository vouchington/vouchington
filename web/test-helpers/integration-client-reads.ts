'use client'

import { clientApi } from '@/lib/api/client/instance'
import type { IntegrityFlagStatusFilter } from '@ts-shared/utils/moderation-catalogs'
import type { PostsResponseBody, ReferralClickLogResponseBody } from '@/types/api-responses'
import type { RssFeedImportStatus } from '@/lib/api/client/import-export'

export function getFriendRecommendations<T>(
  searchParams?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  return clientApi.get<T>('/api/v1/my/friend-recommendations', { searchParams })
}

export function getVoteIntegrityFlagsClient<T>(params?: {
  status?: IntegrityFlagStatusFilter
  after?: string
}): Promise<T> {
  const searchParams: Record<string, string | undefined> = {}
  if (params?.status) searchParams.status = params.status
  if (params?.after) searchParams.after = params.after
  return clientApi.get<T>('/api/v1/vote-integrity/flags', { searchParams })
}

export function getMyReferralClicksClient(after?: string): Promise<ReferralClickLogResponseBody> {
  return clientApi.get<ReferralClickLogResponseBody>('/api/v1/my/referral-clicks', {
    searchParams: after ? { after } : undefined,
  })
}

export async function fetchTopicRecommendations(
  options: {
    q?: string
    status?: 'pending' | 'approved' | 'rejected'
    limit?: number
    signal?: AbortSignal
  } = {},
): Promise<PostsResponseBody> {
  return clientApi.get('/api/v1/topic-recommendations', {
    searchParams: {
      q: options.q,
      status: options.status,
      limit: options.limit,
    },
    signal: options.signal,
  })
}

export function getRssFeedImport(
  importId: string,
  options: { after?: string } = {},
): Promise<RssFeedImportStatus> {
  const query = options.after ? `?after=${encodeURIComponent(options.after)}` : ''
  return clientApi.get<RssFeedImportStatus>(`/api/v1/my/import/rss-feeds/${importId}${query}`)
}

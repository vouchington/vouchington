'use client'

import { clientApi } from './instance'
import { assertPathIdentifier } from './path-identifiers'
import {
  assertFollowerDistributionSendBody,
  type FollowerDistributionSendBody,
} from './follower-distributions'
import type { FollowerDistributionAcceptedResponseBody } from '@/types/api-responses'

export async function sharePostWithFollowers(
  postIdOrSlug: string,
): Promise<FollowerDistributionAcceptedResponseBody> {
  const safePostIdOrSlug = assertPathIdentifier(postIdOrSlug)
  return clientApi.post<FollowerDistributionAcceptedResponseBody>(
    `/api/v1/posts/${encodeURIComponent(safePostIdOrSlug)}/shares`,
  )
}

export async function sendPostToFollowers(
  postIdOrSlug: string,
  body: FollowerDistributionSendBody,
): Promise<FollowerDistributionAcceptedResponseBody> {
  const safePostIdOrSlug = assertPathIdentifier(postIdOrSlug)
  assertFollowerDistributionSendBody(body)
  return clientApi.post<FollowerDistributionAcceptedResponseBody>(
    `/api/v1/posts/${encodeURIComponent(safePostIdOrSlug)}/sends`,
    body,
  )
}

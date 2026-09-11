'use client'

import { clientApi } from './instance'
import type { ModerationQueueClaim } from '@/types/api-responses/community-moderation'

interface ClaimResponse {
  claim: ModerationQueueClaim
  claimed_by_other: boolean
}
interface ConversationResponse {
  conversation: { id: string }
}

export function claimCommunityModerationReport(
  communitySlug: string,
  reportId: string,
): Promise<ClaimResponse> {
  return clientApi.put<ClaimResponse>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/reports/${encodeURIComponent(reportId)}/claim`,
    {},
  )
}

export function releaseCommunityModerationReport(
  communitySlug: string,
  reportId: string,
): Promise<void> {
  return clientApi.delete(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/reports/${encodeURIComponent(reportId)}/claim`,
  )
}

export function claimCommunityPendingPost(
  communitySlug: string,
  postId: string,
): Promise<ClaimResponse> {
  return clientApi.put<ClaimResponse>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/posts/${encodeURIComponent(postId)}/claim`,
    {},
  )
}

export function releaseCommunityPendingPost(communitySlug: string, postId: string): Promise<void> {
  return clientApi.delete(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/posts/${encodeURIComponent(postId)}/claim`,
  )
}

export function openModInternalThreadForReport(
  communitySlug: string,
  reportId: string,
): Promise<ConversationResponse> {
  return clientApi.post<ConversationResponse>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/reports/${encodeURIComponent(reportId)}/mod-internal-thread`,
    {},
  )
}

export function openModInternalThreadForPost(
  communitySlug: string,
  postId: string,
): Promise<ConversationResponse> {
  return clientApi.post<ConversationResponse>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/posts/${encodeURIComponent(postId)}/mod-internal-thread`,
    {},
  )
}

export function escalateCommunityModerationReport(
  communitySlug: string,
  reportId: string,
): Promise<void> {
  return clientApi.post(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/reports/${encodeURIComponent(reportId)}/escalation`,
    {},
  )
}

export function deEscalateCommunityModerationReport(
  communitySlug: string,
  reportId: string,
): Promise<void> {
  return clientApi.delete(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/reports/${encodeURIComponent(reportId)}/escalation`,
  )
}

export function escalateCommunityPendingPost(communitySlug: string, postId: string): Promise<void> {
  return clientApi.post(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/posts/${encodeURIComponent(postId)}/escalation`,
    {},
  )
}

export function deEscalateCommunityPendingPost(
  communitySlug: string,
  postId: string,
): Promise<void> {
  return clientApi.delete(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/posts/${encodeURIComponent(postId)}/escalation`,
  )
}

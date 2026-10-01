'use client'

import { clientApi } from './instance'
import type {
  CommunityAutomodActionSetting,
  CommunityAutomodFeedbackInput,
  CommunityAutomodFeedbackResponseBody,
  CommunityAutomodSettingsResponseBody,
} from '@/types/api-responses'

export function recordCommunityAutomodFeedback(
  idOrSlug: string,
  sourceKey: string,
  input: CommunityAutomodFeedbackInput,
): Promise<CommunityAutomodFeedbackResponseBody> {
  return clientApi.post<CommunityAutomodFeedbackResponseBody>(
    `/api/v1/communities/${idOrSlug}/automod/recent-actions/${encodeURIComponent(sourceKey)}/feedback`,
    input,
  )
}

/** Dismisses the open automod review-queue flag on a post (moderators and site staff). */
export function dismissCommunityAutomodFlag(idOrSlug: string, postId: string): Promise<void> {
  return clientApi.post<void>(
    `/api/v1/communities/${encodeURIComponent(idOrSlug)}/posts/${encodeURIComponent(postId)}/automod-flag/dismissal`,
  )
}

/** Sets what a community prompt's flag does to a published post (moderators and site staff). */
export function updateCommunityAutomodSettings(
  idOrSlug: string,
  input: { automod_action: CommunityAutomodActionSetting },
): Promise<CommunityAutomodSettingsResponseBody> {
  return clientApi.patch<CommunityAutomodSettingsResponseBody>(
    `/api/v1/communities/${encodeURIComponent(idOrSlug)}/automod-settings`,
    input,
  )
}

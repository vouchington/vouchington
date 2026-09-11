'use client'

import { clientApi } from './instance'
import type {
  CommunityAutomodFeedbackInput,
  CommunityAutomodFeedbackResponseBody,
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

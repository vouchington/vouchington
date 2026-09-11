'use client'

import { use } from 'react'
import { ReferralLinksAsideContent } from './referral-links-aside-content'
import type { PrioritizedReferralLinksResponse } from '@/types/api-responses'

interface ReferralLinksAsideStreamingProps {
  topicId: string
  topicSlug?: string | null
  topicType: string
  responsePromise: Promise<PrioritizedReferralLinksResponse>
}

export function ReferralLinksAsideStreaming({
  topicId,
  topicSlug,
  topicType,
  responsePromise,
}: ReferralLinksAsideStreamingProps) {
  const response = use(responsePromise)
  return (
    <ReferralLinksAsideContent
      topicId={topicId}
      topicSlug={topicSlug}
      topicType={topicType}
      response={response}
    />
  )
}

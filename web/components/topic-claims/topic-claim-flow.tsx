'use client'

import { useRouter } from 'next/navigation'
import { ClaimTopicForm } from './claim-topic-form'
import { DomainVerificationPanel } from './domain-verification-panel'
import type { TopicClaim } from '@/types/topic-claims'

interface TopicClaimFlowProps {
  topicIdOrSlug: string
  existingClaim?: TopicClaim
}

export function TopicClaimFlow({ topicIdOrSlug, existingClaim }: TopicClaimFlowProps) {
  const router = useRouter()

  return existingClaim ? (
    <DomainVerificationPanel
      topicIdOrSlug={topicIdOrSlug}
      claim={existingClaim}
      onVerified={() => router.refresh()}
      hasHostname={Boolean(existingClaim.verification_hostname_id)}
    />
  ) : (
    <ClaimTopicForm
      topicIdOrSlug={topicIdOrSlug}
      onSuccess={() => router.refresh()}
    />
  )
}
